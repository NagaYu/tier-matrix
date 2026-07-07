import { describe, expect, it, vi } from 'vitest';
import { runAcrossTiers } from '../../src/index.js';
import { capability, runSmartSearch } from '../fixtures/tiered-app.js';

describe('runAcrossTiers — cleanup failures', () => {
  it('marks an otherwise-passing tier as failed if cleanup() throws, and records cleanupError', async () => {
    const result = await runAcrossTiers({
      tiers: ['webgpu'] as const,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q');
      },
      cleanup: () => {
        throw new Error('cleanup boom');
      },
    });

    expect(result.results[0]?.status).toBe('fail');
    expect((result.results[0]?.error as Error).message).toBe('cleanup boom');
    expect(result.results[0]?.cleanupError).toBeInstanceOf(Error);
  });

  it('keeps the original test() error as primary when both test() and cleanup() fail', async () => {
    const result = await runAcrossTiers({
      tiers: ['wasm-basic'] as const,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q');
      },
      cleanup: () => {
        throw new Error('cleanup boom');
      },
    });

    expect(result.results[0]?.status).toBe('fail');
    expect((result.results[0]?.error as Error).name).toBe('UnsupportedTierError');
    expect(result.results[0]?.cleanupError).toBeInstanceOf(Error);
  });

  it('continues to the next tier even when cleanup() throws for an earlier one', async () => {
    const executed: string[] = [];

    const result = await runAcrossTiers({
      tiers: ['webgpu', 'cpu-fallback'] as const,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async (tier) => {
        executed.push(tier);
        await runSmartSearch('q');
      },
      cleanup: (tier) => {
        if (tier === 'webgpu') throw new Error('cleanup boom');
      },
    });

    expect(executed).toEqual(['webgpu', 'cpu-fallback']);
    expect(result.results[0]?.status).toBe('fail');
    expect(result.results[1]?.status).toBe('pass');
  });

  it('omits cleanupError entirely when cleanup succeeds', async () => {
    const result = await runAcrossTiers({
      tiers: ['webgpu'] as const,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q');
      },
      cleanup: () => {},
    });

    expect(result.results[0]?.cleanupError).toBeUndefined();
    // Presence check, not just value check: cleanupError must be truly absent,
    // not merely set to undefined (see the throw-undefined case below).
    expect(Object.hasOwn(result.results[0] ?? {}, 'cleanupError')).toBe(false);
  });

  it('still records cleanupError as present when cleanup() throws the literal value undefined', async () => {
    const result = await runAcrossTiers({
      tiers: ['webgpu'] as const,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q');
      },
      cleanup: () => {
        throw undefined;
      },
    });

    expect(result.results[0]?.status).toBe('fail');
    // A naive `cleanupError !== undefined` presence check would miss this: the
    // property must be an own property even though its value is `undefined`.
    expect(Object.hasOwn(result.results[0] ?? {}, 'cleanupError')).toBe(true);
  });
});
