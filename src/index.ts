/**
 * Core orchestration for tier-matrix.
 *
 * This module has zero dependency on webgpu-radar, Playwright, or any other
 * portfolio project. It works with any tier enum/union and any mocking
 * mechanism the test author supplies.
 */

/** A single tier's outcome from a `runAcrossTiers` run. */
export interface TierResult<Tier> {
  tier: Tier;
  status: 'pass' | 'fail';
  /** The error thrown by `mock()` or `test()`, or a `TierTimeoutError`. Only set when `status` is `'fail'`. */
  error: unknown;
  /**
   * Set if the `cleanup` step (explicit or auto-detected) threw, in addition to
   * whatever `mock`/`test` did. Cleanup failures never abort the run and never
   * override a `mock`/`test` failure already recorded for this tier.
   */
  cleanupError?: unknown;
  durationMs: number;
}

/** The full report produced by `runAcrossTiers`. */
export interface RunAcrossTiersResult<Tier> {
  results: TierResult<Tier>[];
  passed: number;
  failed: number;
  allPassed: boolean;
}

export interface RunAcrossTiersOptions<Tier> {
  /** The list of tiers to exercise, in order. */
  tiers: readonly Tier[];
  /**
   * Called once per tier, before `test()`. Make your app "see" this tier here
   * (e.g. `vi.spyOn` a capability-check function, swap a DI binding, etc).
   */
  mock: (tier: Tier) => void | Promise<void>;
  /** Your normal test scenario, re-run once per tier after `mock(tier)`. */
  test: (tier: Tier) => void | Promise<void>;
  /**
   * Called once per tier after `test()` finishes (pass or fail), before moving
   * to the next tier. Use this to restore whatever `mock()` changed — e.g.
   * `cleanup: () => vi.restoreAllMocks()` for Vitest spies, or resetting your
   * own DI container for a manual mocking setup.
   *
   * runAcrossTiers does not guess your mocking mechanism or auto-restore
   * anything on your behalf: if you omit `cleanup`, whatever `mock()` changed
   * stays changed into the next tier. What runAcrossTiers *does* guarantee is
   * that this hook always runs, for every tier, even after a `test()` failure
   * or timeout — so a reliable `cleanup` is enough to keep tiers isolated.
   */
  cleanup?: (tier: Tier) => void | Promise<void>;
  /**
   * Per-tier timeout in milliseconds for `test()`. A tier that exceeds this
   * is recorded as a failure with a `TierTimeoutError`, and the run continues
   * to the next tier. Set to `Infinity` to disable. Defaults to `5000`.
   */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

/** Thrown (and captured as a tier's `error`) when `test()` exceeds `timeoutMs` for that tier. */
export class TierTimeoutError extends Error {
  constructor(tier: unknown, timeoutMs: number) {
    super(`tier-matrix: test timed out after ${timeoutMs}ms for tier ${describeTier(tier)}`);
    this.name = 'TierTimeoutError';
  }
}

function describeTier(tier: unknown): string {
  if (typeof tier === 'string' || typeof tier === 'number' || typeof tier === 'boolean') {
    return String(tier);
  }
  try {
    return JSON.stringify(tier) ?? String(tier);
  } catch {
    return String(tier);
  }
}

async function runTestWithTimeout<Tier>(
  test: (tier: Tier) => void | Promise<void>,
  tier: Tier,
  timeoutMs: number,
): Promise<void> {
  if (!Number.isFinite(timeoutMs)) {
    await test(tier);
    return;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TierTimeoutError(tier, timeoutMs)), timeoutMs);
  });

  try {
    await Promise.race([Promise.resolve().then(() => test(tier)), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runCleanup<Tier>(
  tier: Tier,
  cleanup: ((tier: Tier) => void | Promise<void>) | undefined,
): Promise<void> {
  if (cleanup) {
    await cleanup(tier);
  }
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Mocks each tier in turn, re-runs `test()` under it, and reports pass/fail
 * per tier. A failure (thrown error or timeout) on one tier is isolated to
 * that tier's result — it never aborts the run, and `cleanup` always runs
 * before moving to the next tier (even after a failure) so a reliable
 * `cleanup` keeps tiers from leaking into each other.
 */
export async function runAcrossTiers<Tier>(
  options: RunAcrossTiersOptions<Tier>,
): Promise<RunAcrossTiersResult<Tier>> {
  const { tiers, mock, test, cleanup, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const results: TierResult<Tier>[] = [];

  for (const tier of tiers) {
    const start = now();
    let status: TierResult<Tier>['status'] = 'pass';
    let error: unknown;

    try {
      await mock(tier);
      await runTestWithTimeout(test, tier, timeoutMs);
    } catch (caught) {
      status = 'fail';
      error = caught;
    }

    let cleanupThrew = false;
    let cleanupError: unknown;
    try {
      await runCleanup(tier, cleanup);
    } catch (caught) {
      cleanupThrew = true;
      cleanupError = caught;
      if (status === 'pass') {
        status = 'fail';
        error = caught;
      }
    }

    const result: TierResult<Tier> = {
      tier,
      status,
      error,
      durationMs: now() - start,
    };
    // A boolean flag (not `cleanupError !== undefined`) so a cleanup() that
    // throws/rejects with `undefined` still surfaces as a present field.
    if (cleanupThrew) {
      result.cleanupError = cleanupError;
    }
    results.push(result);
  }

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.length - passed;

  return { results, passed, failed, allPassed: failed === 0 };
}

export { formatReport, tierMatchers } from './report.js';
export type { FormatReportOptions } from './report.js';
