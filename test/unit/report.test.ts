import { describe, expect, it } from 'vitest';
import { formatReport, tierMatchers } from '../../src/index.js';
import type { RunAcrossTiersResult } from '../../src/index.js';

const sample: RunAcrossTiersResult<string> = {
  results: [
    { tier: 'webgpu', status: 'pass', error: undefined, durationMs: 12.3 },
    { tier: 'wasm-basic', status: 'fail', error: new Error('boom'), durationMs: 4.5 },
  ],
  passed: 1,
  failed: 1,
  allPassed: false,
};

const allPassing: RunAcrossTiersResult<string> = {
  results: [{ tier: 'webgpu', status: 'pass', error: undefined, durationMs: 1 }],
  passed: 1,
  failed: 0,
  allPassed: true,
};

describe('formatReport', () => {
  it('includes a pass/fail summary line with counts', () => {
    expect(formatReport(sample, { color: false })).toContain('1/2 tiers passed');
  });

  it('marks the passing tier with a check and the failing tier with an x', () => {
    const report = formatReport(sample, { color: false });
    expect(report).toMatch(/✓\s+webgpu/);
    expect(report).toMatch(/✗\s+wasm-basic/);
  });

  it('includes the captured error message for a failing tier', () => {
    expect(formatReport(sample, { color: false })).toContain('boom');
  });

  it('does not print an error block for a passing tier', () => {
    const report = formatReport(allPassing, { color: false });
    // allPassing has exactly one tier, so a correct report is exactly the
    // summary line plus that tier's own line — nothing appended underneath it.
    expect(report.split('\n')).toHaveLength(2);
  });

  it('lists tiers in input order', () => {
    const report = formatReport(sample, { color: false });
    const webgpuIndex = report.indexOf('webgpu');
    const wasmIndex = report.indexOf('wasm-basic');
    expect(webgpuIndex).toBeGreaterThan(-1);
    expect(wasmIndex).toBeGreaterThan(webgpuIndex);
  });

  it('emits no ANSI escapes when color is disabled', () => {
    const esc = String.fromCharCode(27);
    expect(formatReport(sample, { color: false }).includes(`${esc}[`)).toBe(false);
  });

  it('emits ANSI escapes when color is forced on', () => {
    const esc = String.fromCharCode(27);
    expect(formatReport(sample, { color: true }).includes(`${esc}[`)).toBe(true);
  });

  it('includes a cleanup-error note when a tier also had a cleanup failure', () => {
    const withCleanupError: RunAcrossTiersResult<string> = {
      results: [
        {
          tier: 'webgpu',
          status: 'fail',
          error: new Error('cleanup boom'),
          cleanupError: new Error('cleanup boom'),
          durationMs: 1,
        },
      ],
      passed: 0,
      failed: 1,
      allPassed: false,
    };
    expect(formatReport(withCleanupError, { color: false })).toContain('cleanup also threw');
  });

  it('still shows a cleanup-error note when cleanup() threw the literal value undefined', () => {
    const withUndefinedCleanupError: RunAcrossTiersResult<string> = {
      results: [
        {
          tier: 'webgpu',
          status: 'fail',
          error: undefined,
          cleanupError: undefined,
          durationMs: 1,
        },
      ],
      passed: 0,
      failed: 1,
      allPassed: false,
    };
    // cleanupError is a present-but-undefined own property here (as runAcrossTiers
    // produces when cleanup() throws `undefined`) — formatReport must detect its
    // presence rather than checking `!== undefined`, or this note silently disappears.
    expect(formatReport(withUndefinedCleanupError, { color: false })).toContain(
      'cleanup also threw',
    );
  });
});

describe('tierMatchers.toPassAllTiers', () => {
  it('passes when allPassed is true', () => {
    expect(tierMatchers.toPassAllTiers(allPassing).pass).toBe(true);
  });

  it('fails and includes the formatted report in the message when a tier failed', () => {
    const outcome = tierMatchers.toPassAllTiers(sample);
    expect(outcome.pass).toBe(false);
    expect(outcome.message()).toContain('wasm-basic');
    expect(outcome.message()).toContain('boom');
  });

  it('gives a clear message when asserted against an already-all-passing result', () => {
    const outcome = tierMatchers.toPassAllTiers(allPassing);
    expect(outcome.message()).toContain('all 1 tier passed');
  });
});
