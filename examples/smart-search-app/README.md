# smart-search-app example

A tiny capability-tiered semantic search feature, tested across every
[webgpu-radar](https://github.com/NagaYu/webgpu-radar) tier with `tier-matrix`.

It ships a real, tier-specific bug: `src/smart-search-app.ts` validates a
computed embedding's length against an "expected dimension" table before
scoring it, and the `wasm-basic` row of that table was copy-pasted from
`wasm-simd` and never updated — the real `wasm-basic` backend produces
128-dim vectors, not 256. Every developer machine on this (fictional) team has
WebGPU, so this path never ran until it was tested across tiers.

## Run it

```bash
pnpm install
pnpm build            # from the repo root — builds tier-matrix itself first
pnpm --filter smart-search-app-example test
```

`test/smart-search.test.ts` runs the app once per tier via `runAcrossTiers`
and asserts the real, current per-tier report: every tier passes except
`wasm-basic`, which fails with

```
embedding dimension mismatch on tier "wasm-basic": expected 256, got 128
```

See the root [README](../../README.md) for the full write-up.
