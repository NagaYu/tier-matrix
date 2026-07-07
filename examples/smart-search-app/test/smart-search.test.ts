import { formatReport, runAcrossTiers } from 'tier-matrix';
import { webgpuRadarTiers } from 'tier-matrix/presets/webgpu-radar';
import { describe, expect, it, vi } from 'vitest';
import { capability, runSmartSearch } from '../src/smart-search-app.js';

describe('smart-search-app across every capability tier', () => {
  it('demonstrates a real, tier-specific bug: wasm-basic fails while every other tier passes', async () => {
    const result = await runAcrossTiers({
      tiers: webgpuRadarTiers,
      mock: (tier) => {
        vi.spyOn(capability, 'checkCapability').mockResolvedValue(tier);
      },
      cleanup: () => {
        vi.restoreAllMocks();
      },
      test: async () => {
        const response = await runSmartSearch('on-device search');
        expect(response.matches.length).toBeGreaterThan(0);
      },
    });

    // This is exactly what a developer sees in their terminal when this
    // bug is caught — generated live from this run, and reproduced in the
    // project README.
    console.log(formatReport(result));

    const statusByTier = Object.fromEntries(result.results.map((r) => [r.tier, r.status]));
    expect(statusByTier).toEqual({
      'webgpu-full': 'pass',
      'webgpu-limited': 'pass',
      'wasm-simd': 'pass',
      'wasm-basic': 'fail',
      unsupported: 'pass',
    });

    const wasmBasicResult = result.results.find((r) => r.tier === 'wasm-basic');
    expect((wasmBasicResult?.error as Error).message).toBe(
      'embedding dimension mismatch on tier "wasm-basic": expected 256, got 128',
    );
  });

  it('would have looked fine if only tested on the happy (webgpu-full) tier', async () => {
    vi.spyOn(capability, 'checkCapability').mockResolvedValue('webgpu-full');
    const response = await runSmartSearch('on-device search');
    expect(response.matches.length).toBeGreaterThan(0);
    vi.restoreAllMocks();
  });
});
