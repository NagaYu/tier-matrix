import { describe, expect, it, vi } from 'vitest';
import { TierTimeoutError, runAcrossTiers } from '../../src/index.js';
import { capability, runSmartSearch } from '../fixtures/tiered-app.js';

describe('runAcrossTiers — timeout handling', () => {
  it('records a TierTimeoutError and continues when test() never resolves', async () => {
    const result = await runAcrossTiers({
      tiers: ['unsupported'] as const,
      timeoutMs: 30,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q');
      },
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.status).toBe('fail');
    expect(result.results[0]?.error).toBeInstanceOf(TierTimeoutError);
    expect((result.results[0]?.error as Error).message).toContain('unsupported');
  });

  it('still isolates a timing-out tier from a later, healthy tier', async () => {
    const result = await runAcrossTiers({
      tiers: ['unsupported', 'webgpu'] as const,
      timeoutMs: 30,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q');
      },
    });

    expect(result.results[0]?.status).toBe('fail');
    expect(result.results[1]?.status).toBe('pass');
  });

  it('does not impose a timeout when timeoutMs is Infinity', async () => {
    const result = await runAcrossTiers({
      tiers: ['webgpu'] as const,
      timeoutMs: Number.POSITIVE_INFINITY,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q');
      },
    });

    expect(result.allPassed).toBe(true);
  });

  it('defaults to a 5s timeout when timeoutMs is not specified', async () => {
    const result = await runAcrossTiers({
      tiers: ['webgpu'] as const,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q');
      },
    });

    expect(result.allPassed).toBe(true);
  });
});
