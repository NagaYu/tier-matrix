import type { WebGpuRadarTier as Tier } from 'tier-matrix/presets/webgpu-radar';
import { embed } from './embeddings.js';

/**
 * The capability-check seam — mirrors `myApp.checkCapability()` from the
 * tier-matrix README quickstart. In production this would call
 * `webgpu-radar`'s `probe()`; tests mock it with `vi.spyOn`.
 */
export const capability = {
  async checkCapability(): Promise<Tier> {
    throw new Error(
      "checkCapability() has no real implementation in this example — call webgpu-radar's probe() in a real app, or mock it in tests.",
    );
  },
};

export interface SearchMatch {
  text: string;
  score: number;
}

export interface SearchResponse {
  query: string;
  tier: Tier;
  matches: SearchMatch[];
}

/**
 * The dimension each tier's embedding backend is EXPECTED to produce, used to
 * validate a computed vector before scoring it against the document index —
 * a defensive guard against silently scoring a mismatched/corrupt embedding.
 *
 * THE BUG: `wasm-basic` was copy-pasted from the `wasm-simd` row when the
 * basic fallback tier was added, and never updated. The real basic-tier
 * backend (see embeddings.ts) produces 128-dim vectors, not 256 — so this
 * guard rejects perfectly valid embeddings on that tier alone. Every
 * developer machine on this team has WebGPU, so this path never ran until
 * tier-matrix exercised it.
 */
const EXPECTED_EMBEDDING_DIM: Record<Tier, number> = {
  'webgpu-full': 384,
  'webgpu-limited': 384,
  'wasm-simd': 256,
  'wasm-basic': 256, // BUG: should be 128, see comment above.
  unsupported: 0,
};

const DOCUMENT_INDEX = [
  'on-device search keeps queries off the network',
  'privacy-preserving inference runs entirely on the client',
  'capability-tiered fallback degrades gracefully across devices',
  'edge embeddings avoid a round trip to a cloud model',
];

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

async function cloudFallbackSearch(query: string): Promise<SearchResponse> {
  return {
    query,
    tier: 'unsupported',
    matches: DOCUMENT_INDEX.map((text) => ({
      text,
      score: text.includes(query) ? 1 : 0.1,
    })),
  };
}

/** Runs semantic search using whichever tier `capability.checkCapability()` resolves to. */
export async function runSmartSearch(query: string): Promise<SearchResponse> {
  const tier = await capability.checkCapability();

  if (tier === 'unsupported') {
    return cloudFallbackSearch(query);
  }

  const queryVector = embed(query, tier);
  const expectedDim = EXPECTED_EMBEDDING_DIM[tier];
  if (queryVector.length !== expectedDim) {
    throw new Error(
      `embedding dimension mismatch on tier "${tier}": expected ${expectedDim}, got ${queryVector.length}`,
    );
  }

  const matches = DOCUMENT_INDEX.map((text) => ({
    text,
    score: cosineSimilarity(queryVector, embed(text, tier)),
  })).sort((a, b) => b.score - a.score);

  return { query, tier, matches };
}
