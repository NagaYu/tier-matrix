# tier-matrix

> Verification component of the local-first suite: mocks every on-device AI fallback tier and
> re-tests it. See the suite core ([local-first-llm](https://github.com/NagaYu/local-first-llm))
> for the routing policy it verifies.

[![CI](https://github.com/NagaYu/tier-matrix/actions/workflows/ci.yml/badge.svg)](https://github.com/NagaYu/tier-matrix/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/tier-matrix.svg)](https://www.npmjs.com/package/tier-matrix)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Mock every capability tier your on-device AI app can fall back to, and
re-run your existing test through each one — so a broken WASM fallback or a
broken "unsupported" empty state can't ship without a test ever noticing.

## The problem

Apps that adopt capability-tiered on-device AI — WebGPU when it's fast
enough, WASM when it isn't, a cloud fallback when neither works (the exact
pattern [`webgpu-radar`](https://github.com/NagaYu/webgpu-radar) exists to
detect) — have real branching behavior: different code runs depending on
which tier a user's device lands in.

Almost nobody tests all of those paths. Doing so today means physically
owning devices spanning every tier, or hand-rolling a mock in each test file.
It's easy to test the happy path — full WebGPU, on a developer's own capable
machine — and ship a broken fallback that never ran in CI. `tier-matrix` mocks
every tier for you and re-runs the same test scenario under each one, so your
existing test suite can verify every degradation path actually works.

## Quickstart

```ts
import { runAcrossTiers } from 'tier-matrix';
import { webgpuRadarTiers } from 'tier-matrix/presets/webgpu-radar'; // optional preset

const results = await runAcrossTiers({
  tiers: webgpuRadarTiers, // or your own tier list
  mock: (tier) => {
    // however you make your app "see" this tier — e.g. vi.spyOn your capability-check function
    vi.spyOn(myApp, 'checkCapability').mockResolvedValue(tier);
  },
  cleanup: () => {
    vi.restoreAllMocks(); // always runs, even after a failure — keeps tiers isolated
  },
  test: async () => {
    const result = await myApp.runSmartSearch('hello');
    expect(result).toBeDefined(); // your normal assertions
  },
});

// results: per-tier pass/fail, captured errors, timing
```

## A real bug this catches

[`examples/smart-search-app`](./examples/smart-search-app) is a small
capability-tiered semantic search feature. Its embedding backend genuinely
produces a different vector length per tier — a 384-dim model on WebGPU, a
256-dim WASM-SIMD model, and a 128-dim model on the weakest `wasm-basic`
fallback. A defensive guard checks that a computed embedding's length matches
what that tier is expected to produce before scoring it.

The `wasm-basic` row of that "expected dimension" table was copy-pasted from
`wasm-simd` when the fallback tier was added, and never updated. Every
developer machine on the (fictional) team has WebGPU, so this path never ran
— until it was tested across tiers:

```
tier-matrix: 4/5 tiers passed
  ✓ webgpu-full (0.9ms)
  ✓ webgpu-limited (0.2ms)
  ✓ wasm-simd (0.3ms)
  ✗ wasm-basic (0.1ms)
      Error: embedding dimension mismatch on tier "wasm-basic": expected 256, got 128
          at Module.runSmartSearch (src/smart-search-app.ts:91:11)
  ✓ unsupported (0.1ms)
```

One `runAcrossTiers` call, one existing test, zero extra devices — and the
bug is right there, on the one tier where it actually lives. See
[`examples/smart-search-app`](./examples/smart-search-app) for the full app,
the bug, and the test that catches it.

## API

### `runAcrossTiers(options)`

```ts
interface RunAcrossTiersOptions<Tier> {
  tiers: readonly Tier[];
  mock: (tier: Tier) => void | Promise<void>;
  test: (tier: Tier) => void | Promise<void>;
  cleanup?: (tier: Tier) => void | Promise<void>;
  timeoutMs?: number; // per-tier test() timeout; default 5000, Infinity disables it
}

interface RunAcrossTiersResult<Tier> {
  results: Array<{
    tier: Tier;
    status: 'pass' | 'fail';
    error: unknown; // set when status is 'fail'
    cleanupError?: unknown; // set if cleanup() itself threw
    durationMs: number;
  }>;
  passed: number;
  failed: number;
  allPassed: boolean;
}
```

For each tier, in order: `mock(tier)` runs, then `test(tier)` runs (raced
against `timeoutMs`), then `cleanup(tier)` always runs — regardless of
whether `mock`/`test` threw, timed out, or passed. A failure on one tier is
captured as that tier's result; it never aborts the run and never skips
`cleanup`, so tiers can't leak into each other as long as `cleanup` reliably
undoes what `mock` changed.

`tier-matrix` doesn't guess your mocking mechanism — `cleanup` isn't
auto-detected. If you omit it, whatever `mock()` changed stays changed into
the next tier. Vitest users should pass `cleanup: () => vi.restoreAllMocks()`,
as in the quickstart above.

### `formatReport(result, options?)`

Formats a `RunAcrossTiersResult` as the scannable, colored terminal report
shown above (`{ color?: boolean }` to force color on/off; auto-detects a TTY
by default).

### `tierMatchers` — optional Vitest matcher

```ts
import { expect } from 'vitest';
import { tierMatchers } from 'tier-matrix';
expect.extend(tierMatchers);

expect(results).toPassAllTiers();
```

On failure, the assertion message includes the full `formatReport` output.
For compile-time typing on `toPassAllTiers`, add to a `.d.ts` in your project:

```ts
import 'vitest';
declare module 'vitest' {
  interface Assertion<T = unknown> {
    toPassAllTiers(): T;
  }
}
```

### `tier-matrix/presets/webgpu-radar`

```ts
import { webgpuRadarTiers } from 'tier-matrix/presets/webgpu-radar';
// ['webgpu-full', 'webgpu-limited', 'wasm-simd', 'wasm-basic', 'unsupported']
```

A tier list shaped to match
[`webgpu-radar`](https://github.com/NagaYu/webgpu-radar)'s `Tier` type. This
is a separate, optional entry point with `webgpu-radar` as an optional peer
dependency — the core (`tier-matrix`) has zero dependency on it, or on any
other portfolio project, and works with any tier enum and any mocking
mechanism you supply.

### `tier-matrix/playwright` — real end-to-end tiers

Some degradation bugs only show up in real browser behavior — an actual
WebGPU context creation failure, not just an in-process mock. `runAcrossTiersInBrowser`
drives the same pattern through Playwright, using Playwright's own
capability-forcing mechanisms (e.g. disabling WebGPU via a Chromium launch
flag) instead of mocking a function:

```ts
import { runAcrossTiersInBrowser } from 'tier-matrix/playwright';

const results = await runAcrossTiersInBrowser({
  tiers: [
    { tier: 'webgpu-full' }, // default launch — real WebGPU if the runner has it
    { tier: 'webgpu-forced-off', launchOptions: { args: ['--disable-webgpu'] } },
  ],
  test: async (page, tier) => {
    await page.goto('https://your-app.example');
    const usedTier = await page.evaluate(() => window.__lastTierUsed);
    expect(usedTier).toBe(tier);
  },
});
```

Each tier launches a genuinely fresh browser with that tier's
`launchOptions`/`contextOptions`, runs `test(page, tier)` against it, and
closes the browser before moving on — the same per-tier isolation and
failure-capturing guarantees as `runAcrossTiers`, just backed by a real
browser instead of a function mock. `@playwright/test` is an optional peer
dependency of this entry point only; the core stays dependency-free.

## Prior art

Graceful degradation, chaos engineering, and feature-flag-driven fallback
testing are well-established general software resilience practices —
`tier-matrix` applies that mindset specifically to AI capability tiers, which
nothing purpose-built currently addresses. General AI/UI test automation
platforms (BrowserStack, Sauce Labs, and similar) test functional and visual
correctness broadly, not capability-tier-specific degradation paths —
different layer, not a competing tool.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Local-first suite

This repository is the verification component of the local-first suite.

- Suite core (routing policy): [local-first-llm](https://github.com/NagaYu/local-first-llm)
- Full list of suite repositories and their roles: [Suite map](https://github.com/NagaYu/local-first-llm#suite-map)

## License

MIT — see [LICENSE](./LICENSE).
