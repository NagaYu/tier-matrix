import type { WebGpuRadarTier as Tier } from 'tier-matrix/presets/webgpu-radar';

/**
 * The real output length of each tier's embedding backend. In a real app this
 * would be a WebGPU compute shader, a WASM-SIMD build, or a plain WASM build
 * of the embedding model — each ships a differently-sized quantized model, so
 * the vector length genuinely varies by tier.
 */
const ACTUAL_EMBEDDING_DIM: Record<Tier, number> = {
  'webgpu-full': 384,
  'webgpu-limited': 384,
  'wasm-simd': 256,
  'wasm-basic': 128,
  unsupported: 0,
};

/**
 * Simulates a tier-specific embedding backend with a deterministic, seeded
 * output (so this example runs anywhere without a real model or WebGPU/WASM
 * runtime, while still reproducing the app's real per-tier vector lengths).
 */
export function embed(text: string, tier: Tier): Float32Array {
  const dim = ACTUAL_EMBEDDING_DIM[tier];
  const vector = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    const char = text.charCodeAt(i % Math.max(text.length, 1)) || 0;
    vector[i] = ((char + i * 31) % 97) / 97;
  }
  return vector;
}
