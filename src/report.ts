import type { RunAcrossTiersResult } from './index.js';

interface ColorFns {
  green: (s: string) => string;
  red: (s: string) => string;
  dim: (s: string) => string;
  bold: (s: string) => string;
}

const ansiColors: ColorFns = {
  green: (s) => `[32m${s}[39m`,
  red: (s) => `[31m${s}[39m`,
  dim: (s) => `[2m${s}[22m`,
  bold: (s) => `[1m${s}[22m`,
};

const noColors: ColorFns = {
  green: (s) => s,
  red: (s) => s,
  dim: (s) => s,
  bold: (s) => s,
};

function shouldUseColorByDefault(): boolean {
  const proc = (globalThis as { process?: NodeJS.Process }).process;
  if (!proc?.stdout?.isTTY) return false;
  if (proc.env?.NO_COLOR !== undefined) return false;
  return true;
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

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return String(error);
}

function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => `${pad}${line}`)
    .join('\n');
}

export interface FormatReportOptions {
  /** Force color on/off. Defaults to auto-detecting a color-capable TTY. */
  color?: boolean;
}

/**
 * Formats a `RunAcrossTiersResult` as a scannable, human-readable report:
 * one line per tier with a pass/fail marker and timing, and the captured
 * error (with stack) indented underneath each failing tier.
 */
export function formatReport<Tier>(
  result: RunAcrossTiersResult<Tier>,
  options: FormatReportOptions = {},
): string {
  const useColor = options.color ?? shouldUseColorByDefault();
  const c = useColor ? ansiColors : noColors;

  const total = result.results.length;
  const lines: string[] = [
    c.bold(`tier-matrix: ${result.passed}/${total} tier${total === 1 ? '' : 's'} passed`),
  ];

  for (const tierResult of result.results) {
    const icon = tierResult.status === 'pass' ? c.green('✓') : c.red('✗');
    const label = describeTier(tierResult.tier);
    const timing = c.dim(`(${tierResult.durationMs.toFixed(1)}ms)`);
    lines.push(`  ${icon} ${label} ${timing}`);

    if (tierResult.status === 'fail') {
      lines.push(c.red(indent(describeError(tierResult.error), 6)));
    }
    if (Object.hasOwn(tierResult, 'cleanupError')) {
      lines.push(c.dim(indent(`cleanup also threw: ${describeError(tierResult.cleanupError)}`, 6)));
    }
  }

  return lines.join('\n');
}

interface MinimalMatcherResult {
  pass: boolean;
  message: () => string;
}

/**
 * An `expect.extend`-compatible matcher object for Vitest (or any
 * Jest-compatible `expect`):
 *
 * ```ts
 * import { expect } from 'vitest';
 * import { tierMatchers } from 'tier-matrix';
 * expect.extend(tierMatchers);
 *
 * expect(results).toPassAllTiers();
 * ```
 *
 * On failure, the assertion message includes the full `formatReport` output
 * so the failing tiers and their errors are visible directly in test output.
 * Written without importing `vitest`'s types, so the core stays dependency-free;
 * see the README for the optional `declare module 'vitest'` augmentation to
 * get compile-time typing for `toPassAllTiers`.
 */
export const tierMatchers = {
  toPassAllTiers(received: RunAcrossTiersResult<unknown>): MinimalMatcherResult {
    const pass = received.allPassed;
    return {
      pass,
      message: () => {
        const total = received.results.length;
        return pass
          ? `expected at least one tier to fail, but all ${total} tier${total === 1 ? '' : 's'} passed`
          : `expected all tiers to pass, but ${received.failed}/${total} failed:\n\n${formatReport(received, { color: false })}`;
      },
    };
  },
};
