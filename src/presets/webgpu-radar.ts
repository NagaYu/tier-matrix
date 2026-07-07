/**
 * Optional preset: a tier list shaped to match webgpu-radar's `Tier` type
 * (https://github.com/NagaYu/webgpu-radar), ready to pass to `runAcrossTiers`.
 *
 * This file has no import of `webgpu-radar` at runtime or compile time — the
 * type below is a structural mirror of webgpu-radar's `Tier` export, kept in
 * sync by hand since it's a small, stable string-literal union. `webgpu-radar`
 * remains an optional peer dependency: install it if you want your own
 * capability-check function typed against its actual `Tier` export, but this
 * preset works standalone, with or without it installed.
 */

/** Mirrors webgpu-radar's `Tier` type, in descending order of capability. */
export type WebGpuRadarTier =
  | 'webgpu-full'
  | 'webgpu-limited'
  | 'wasm-simd'
  | 'wasm-basic'
  | 'unsupported';

/**
 * All of webgpu-radar's tiers, in descending order of capability:
 *
 * ```ts
 * import { runAcrossTiers } from 'tier-matrix';
 * import { webgpuRadarTiers } from 'tier-matrix/presets/webgpu-radar';
 *
 * await runAcrossTiers({ tiers: webgpuRadarTiers, mock, test });
 * ```
 */
export const webgpuRadarTiers: readonly WebGpuRadarTier[] = [
  'webgpu-full',
  'webgpu-limited',
  'wasm-simd',
  'wasm-basic',
  'unsupported',
];
