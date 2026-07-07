import { describe, expect, it } from 'vitest';
import { runAcrossTiers } from '../../../src/index.js';
import { webgpuRadarTiers } from '../../../src/presets/webgpu-radar.js';

describe('webgpuRadarTiers preset', () => {
  it('lists exactly the five webgpu-radar tiers, in descending order of capability', () => {
    expect(webgpuRadarTiers).toEqual([
      'webgpu-full',
      'webgpu-limited',
      'wasm-simd',
      'wasm-basic',
      'unsupported',
    ]);
  });

  it('plugs directly into runAcrossTiers as a tier list', async () => {
    const seenTiers: string[] = [];

    const result = await runAcrossTiers({
      tiers: webgpuRadarTiers,
      mock: (tier) => {
        seenTiers.push(tier);
      },
      test: () => {},
    });

    expect(seenTiers).toEqual(webgpuRadarTiers);
    expect(result.results).toHaveLength(webgpuRadarTiers.length);
    expect(result.allPassed).toBe(true);
  });

  it("loads without webgpu-radar installed (it is not present in this repo's node_modules)", async () => {
    // If this preset module imported webgpu-radar at runtime, this would throw
    // at load time — webgpu-radar isn't installed here (it isn't on npm yet).
    const mod = await import('../../../src/presets/webgpu-radar.js');
    expect(mod.webgpuRadarTiers).toEqual(webgpuRadarTiers);
  });
});
