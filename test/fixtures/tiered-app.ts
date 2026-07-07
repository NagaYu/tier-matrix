/**
 * A small fixture "app" whose behavior intentionally varies by tier, used to
 * exercise `runAcrossTiers` itself in the unit tests. Not part of the published
 * package. `capability.checkTier()` mirrors the `myApp.checkCapability()` seam
 * from the README quickstart — tests mock it with `vi.spyOn`.
 */

export type FixtureTier = 'webgpu' | 'wasm-basic' | 'cpu-fallback' | 'unsupported';

export const ALL_FIXTURE_TIERS: readonly FixtureTier[] = [
  'webgpu',
  'wasm-basic',
  'cpu-fallback',
  'unsupported',
];

export class UnsupportedTierError extends Error {
  constructor(tier: FixtureTier) {
    super(`fixture app does not support tier: ${tier}`);
    this.name = 'UnsupportedTierError';
  }
}

export const capability = {
  async checkTier(): Promise<FixtureTier> {
    throw new Error('capability.checkTier() was not mocked for this test');
  },
};

/**
 * Runs "search" using whatever tier `capability.checkTier()` currently
 * resolves to. Intentionally broken on `wasm-basic` (throws) and hangs
 * forever on `unsupported` (exercises the timeout path), so unit tests have
 * real, distinct failure modes to assert against per tier.
 */
export async function runSmartSearch(query: string): Promise<string> {
  const tier = await capability.checkTier();

  switch (tier) {
    case 'webgpu':
      return `webgpu-result:${query}`;
    case 'cpu-fallback':
      return `cpu-fallback-result:${query}`;
    case 'wasm-basic':
      throw new UnsupportedTierError(tier);
    case 'unsupported':
      // Never resolves — exercises runAcrossTiers' timeout handling.
      return new Promise<string>(() => {});
    default: {
      const exhaustive: never = tier;
      throw new Error(`unreachable tier: ${String(exhaustive)}`);
    }
  }
}
