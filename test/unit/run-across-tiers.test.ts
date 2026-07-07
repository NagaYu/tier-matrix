import { describe, expect, it, vi } from 'vitest';
import { runAcrossTiers } from '../../src/index.js';
import {
  ALL_FIXTURE_TIERS,
  UnsupportedTierError,
  capability,
  runSmartSearch,
} from '../fixtures/tiered-app.js';

describe('runAcrossTiers — orchestration correctness against the fixture app', () => {
  it("reports pass/fail per tier matching the fixture app's real per-tier behavior", async () => {
    const result = await runAcrossTiers({
      tiers: ALL_FIXTURE_TIERS,
      timeoutMs: 50,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        const value = await runSmartSearch('hello');
        expect(value).toContain('hello');
      },
    });

    expect(result.results.map((r) => r.tier)).toEqual(ALL_FIXTURE_TIERS);
    expect(result.results.map((r) => r.status)).toEqual(['pass', 'fail', 'pass', 'fail']);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(2);
    expect(result.allPassed).toBe(false);
  });

  it('captures the real thrown error for the tier that fails synchronously', async () => {
    const result = await runAcrossTiers({
      tiers: ALL_FIXTURE_TIERS,
      timeoutMs: 50,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('hello');
      },
    });

    const wasmResult = result.results.find((r) => r.tier === 'wasm-basic');
    expect(wasmResult?.status).toBe('fail');
    expect(wasmResult?.error).toBeInstanceOf(UnsupportedTierError);
  });

  it('passes when only tiers the fixture app actually supports are exercised', async () => {
    const result = await runAcrossTiers({
      tiers: ['webgpu', 'cpu-fallback'] as const,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q');
      },
    });

    expect(result.allPassed).toBe(true);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('calls mock() exactly once per tier, in tier order', async () => {
    const calls: string[] = [];

    await runAcrossTiers({
      tiers: ALL_FIXTURE_TIERS,
      timeoutMs: 20,
      mock: (tier) => {
        calls.push(tier);
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('x').catch(() => {});
      },
    });

    expect(calls).toEqual(ALL_FIXTURE_TIERS);
  });

  it('records a positive durationMs for every tier', async () => {
    const result = await runAcrossTiers({
      tiers: ALL_FIXTURE_TIERS,
      timeoutMs: 20,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q').catch(() => {});
      },
    });

    for (const r of result.results) {
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns a TierResult with exactly the documented shape for a passing tier (no stale or extra fields)', async () => {
    const result = await runAcrossTiers({
      tiers: ['webgpu'] as const,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q');
      },
    });

    expect(result.results).toHaveLength(1);
    // toStrictEqual (not toEqual) so an unexpected extra key — e.g. a stray
    // cleanupError — would actually fail this, not be silently ignored.
    expect(result.results[0]).toStrictEqual({
      tier: 'webgpu',
      status: 'pass',
      error: undefined,
      durationMs: expect.any(Number),
    });
  });

  it("does not leak a previous tier's failure onto a later, passing tier's result", async () => {
    const result = await runAcrossTiers({
      tiers: ['wasm-basic', 'webgpu'] as const,
      timeoutMs: 20,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        await runSmartSearch('q');
      },
    });

    expect(result.results[1]).toStrictEqual({
      tier: 'webgpu',
      status: 'pass',
      error: undefined,
      durationMs: expect.any(Number),
    });
  });

  it('supports a test() callback that ignores the tier argument, matching the README quickstart shape', async () => {
    const result = await runAcrossTiers({
      tiers: ['webgpu'] as const,
      mock: (tier) => {
        vi.spyOn(capability, 'checkTier').mockResolvedValue(tier);
      },
      test: async () => {
        const value = await runSmartSearch('hello');
        expect(value).toBeDefined();
      },
    });

    expect(result.allPassed).toBe(true);
  });
});
