# Contributing to tier-matrix

Thanks for considering a contribution.

## Development setup

```bash
pnpm install
pnpm build
pnpm test
```

Requires Node.js >= 18.18 and pnpm (see `packageManager` in `package.json`).

## Project layout

- `src/index.ts` — core `runAcrossTiers` orchestration and public types.
- `src/report.ts` — report formatting (`formatReport`) and the optional Vitest matcher (`tierMatchers`).
- `src/playwright.ts` — the Playwright-driven variant, for real-browser capability forcing.
- `src/presets/webgpu-radar.ts` — optional tier list preset shaped to `webgpu-radar`'s `Tier` type.
- `test/fixtures/` — a small fixture "app" whose behavior intentionally varies by tier, used to test the orchestrator itself.
- `test/unit/` — unit tests for the core orchestration and reporting logic.
- `test/e2e/` — Playwright end-to-end tests for the Playwright variant.
- `examples/smart-search-app/` — a runnable example demonstrating a real tier-specific bug caught by `tier-matrix`.

## Design principles to preserve

- The core (`runAcrossTiers`, `report.ts`) must have **zero dependency** on `webgpu-radar` or any other portfolio project, and must work with any tier enum/union and any mocking mechanism the test author supplies. Please don't add a hard import of `webgpu-radar` or `playwright` to `src/index.ts` or `src/report.ts`.
- `tier-matrix/presets/webgpu-radar` and `tier-matrix/playwright` are separate entry points with optional peer dependencies. They must not be imported from the core entry point, and the core must build and run correctly with those peer dependencies absent.
- A failure in one tier must never abort the run or leak mock state into the next tier — this is the central correctness guarantee of the tool, and any change to the orchestration loop should come with a test that would fail without the fix.

## Before opening a PR

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e          # requires: pnpm exec playwright install --with-deps chromium
pnpm typecheck:example
pnpm test:example
```

## Commit style

Use clear, imperative commit messages (e.g. `Fix timeout race in runAcrossTiers`). Keep PRs focused — one logical change per PR.

## Reporting bugs

Please open a GitHub issue with a minimal reproduction: the tier list, the `mock`/`test` callbacks involved, and the actual vs. expected report output.
