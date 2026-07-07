# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-07

### Added

- `runAcrossTiers` core orchestration API: mock each capability tier in turn, re-run a test scenario under each, and report pass/fail per tier without aborting on the first failure.
- Per-tier isolation: failures (thrown errors or timeouts) are captured per tier and never leak into or abort subsequent tiers, as long as an optional `cleanup(tier)` hook reliably undoes whatever `mock()` changed — `cleanup` always runs, even after a `test()` failure or timeout.
- `formatReport` for a scannable, colored terminal summary of a tier run.
- `tierMatchers` — an optional `expect.extend`-compatible Vitest matcher (`toPassAllTiers`).
- `tier-matrix/presets/webgpu-radar` — optional preset tier list shaped to `webgpu-radar`'s `Tier` type (peer dependency, not required by core).
- `tier-matrix/playwright` — a parallel helper for running the tier matrix against a real page via Playwright, using Playwright's own capability-forcing mechanisms (e.g. disabling WebGPU via launch flags).
- `examples/smart-search-app` — a small example app demonstrating a real, tier-specific bug caught by `tier-matrix`.
