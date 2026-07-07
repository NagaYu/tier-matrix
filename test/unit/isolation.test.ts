import { describe, expect, it, vi } from 'vitest';
import { runAcrossTiers } from '../../src/index.js';
import { ALL_FIXTURE_TIERS, capability, runSmartSearch } from '../fixtures/tiered-app.js';

describe('runAcrossTiers — per-tier isolation', () => {
  it('does not abort the run when an earlier tier fails — every tier still gets a result', async () => {
    const result = await runAcrossTiers({
      tiers: ALL_FIXTURE_TIERS,
      timeoutMs: 20,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q');
      },
    });

    expect(result.results).toHaveLength(ALL_FIXTURE_TIERS.length);
    expect(result.results.map((r) => r.tier)).toEqual(ALL_FIXTURE_TIERS);
  });

  it("still executes every tier's test() body even though earlier tiers threw or timed out", async () => {
    const executedTiers: string[] = [];

    await runAcrossTiers({
      tiers: ALL_FIXTURE_TIERS,
      timeoutMs: 20,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async (tier) => {
        executedTiers.push(tier);
        await runSmartSearch('q');
      },
    });

    expect(executedTiers).toEqual(ALL_FIXTURE_TIERS);
  });

  it('leaks mock state into the next tier when no cleanup is supplied — runAcrossTiers does not guess the mocking mechanism', async () => {
    const originalCheckTier = capability.checkTier;
    const wasOriginalAtStartOfTier: boolean[] = [];

    await runAcrossTiers({
      tiers: ['webgpu', 'wasm-basic'] as const,
      timeoutMs: 20,
      mock: (tier) => {
        wasOriginalAtStartOfTier.push(capability.checkTier === originalCheckTier);
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q').catch(() => {});
      },
    });

    // Tier 2 starts with tier 1's mock still in place: with no `cleanup` supplied,
    // runAcrossTiers has no way to know how to undo an arbitrary `mock()`.
    expect(wasOriginalAtStartOfTier).toEqual([true, false]);
  });

  it('prevents cross-tier mock leakage when an explicit cleanup(tier) is supplied', async () => {
    const originalCheckTier = capability.checkTier;
    const wasOriginalAtStartOfTier: boolean[] = [];

    await runAcrossTiers({
      tiers: ['webgpu', 'wasm-basic', 'cpu-fallback'] as const,
      timeoutMs: 20,
      mock: (tier) => {
        wasOriginalAtStartOfTier.push(capability.checkTier === originalCheckTier);
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q').catch(() => {});
      },
      cleanup: () => {
        vi.restoreAllMocks();
      },
    });

    expect(wasOriginalAtStartOfTier).toEqual([true, true, true]);
    expect(capability.checkTier).toBe(originalCheckTier);
  });

  it('runs cleanup(tier) even after a tier fails, before moving to the next tier', async () => {
    const originalCheckTier = capability.checkTier;
    const wasOriginalAtStartOfTier: boolean[] = [];

    await runAcrossTiers({
      tiers: ['wasm-basic', 'unsupported', 'webgpu'] as const,
      timeoutMs: 20,
      mock: (tier) => {
        wasOriginalAtStartOfTier.push(capability.checkTier === originalCheckTier);
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q').catch(() => {});
      },
      cleanup: () => {
        vi.restoreAllMocks();
      },
    });

    // Tiers 1 and 2 both fail (throw / time out) — cleanup must still run before each,
    // so tier 3 starts clean too.
    expect(wasOriginalAtStartOfTier).toEqual([true, true, true]);
  });

  it('runs the explicit cleanup(tier) hook once per tier, in tier order', async () => {
    const cleanupCalls: string[] = [];

    await runAcrossTiers({
      tiers: ALL_FIXTURE_TIERS,
      timeoutMs: 20,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q').catch(() => {});
      },
      cleanup: (tier) => {
        cleanupCalls.push(tier);
      },
    });

    expect(cleanupCalls).toEqual(ALL_FIXTURE_TIERS);
  });

  it('isolates a tier whose test() throws synchronously (not via a rejected promise) — does not abort the run or skip cleanup', async () => {
    const executed: string[] = [];
    const cleanupCalls: string[] = [];

    const result = await runAcrossTiers({
      tiers: ['a', 'b'] as const,
      mock: () => {},
      test: (tier) => {
        executed.push(tier);
        if (tier === 'a') {
          throw new Error('synchronous boom');
        }
      },
      cleanup: (tier) => {
        cleanupCalls.push(tier);
      },
    });

    expect(executed).toEqual(['a', 'b']);
    expect(cleanupCalls).toEqual(['a', 'b']);
    expect(result.results[0]).toMatchObject({ tier: 'a', status: 'fail' });
    expect(result.results[0]?.error).toBeInstanceOf(Error);
    expect((result.results[0]?.error as Error).message).toBe('synchronous boom');
    expect(result.results[1]).toMatchObject({ tier: 'b', status: 'pass' });
  });
});
