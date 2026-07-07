/**
 * Playwright-driven variant of `runAcrossTiers`, for true end-to-end tests
 * against a real browser — some degradation bugs (e.g. an actual WebGPU
 * context creation failure) only show up in real browser behavior, not an
 * in-process mock.
 *
 * Each "tier" here is a real browser launched with tier-specific launch/context
 * options (Playwright's own capability-forcing mechanisms, e.g. disabling
 * WebGPU via a Chromium launch flag), so this reuses the exact same
 * orchestration (`runAcrossTiers`) as the core: a fresh browser is launched per
 * tier via `mock`, `test` runs against that tier's page, and `cleanup` always
 * closes the browser before moving to the next tier — the same per-tier
 * isolation and failure-capturing guarantees apply here.
 *
 * `@playwright/test` is an optional peer dependency — only this entry point
 * imports it, so the core (`tier-matrix`) still has zero dependency on it.
 */
import type {
  Browser,
  BrowserContextOptions,
  BrowserType,
  LaunchOptions,
  Page,
} from '@playwright/test';
import { chromium } from '@playwright/test';
import { runAcrossTiers } from './index.js';
import type { RunAcrossTiersResult } from './index.js';

/** A single browser-level tier: what tier it represents, and how to force it. */
export interface BrowserTier<Tier> {
  tier: Tier;
  /** Passed to `browserType.launch()` — e.g. `{ args: ['--disable-webgpu'] }`. */
  launchOptions?: LaunchOptions;
  /** Passed to `browser.newContext()`. */
  contextOptions?: BrowserContextOptions;
}

export interface RunAcrossTiersInBrowserOptions<Tier> {
  /** The list of browser-forced tiers to exercise, in order. */
  tiers: readonly BrowserTier<Tier>[];
  /** Defaults to `chromium` (the only engine that currently exposes WebGPU launch flags). */
  browserType?: BrowserType;
  /** Your test scenario, given a fresh `Page` for this tier's browser. */
  test: (page: Page, tier: Tier) => void | Promise<void>;
  /** Per-tier timeout in milliseconds for `test()`. See `runAcrossTiers`. Defaults to `30000`. */
  timeoutMs?: number;
}

const DEFAULT_BROWSER_TIMEOUT_MS = 30_000;

async function withTimeout<T>(
  work: () => Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs)) {
    return work();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([work(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mocks each tier by launching a fresh browser with that tier's launch/context
 * options, runs `test(page, tier)` against it, and closes the browser before
 * moving to the next tier. See `runAcrossTiers` for the isolation and
 * reporting guarantees this inherits.
 *
 * `tiers` must not contain repeated `tier` values — since each tier's
 * `launchOptions`/`contextOptions` are looked up by that value, a duplicate
 * would silently discard one config in favor of another.
 *
 * Unlike `runAcrossTiers`'s core `mock`, the browser-launch step here (launch
 * + newContext + newPage) is itself bounded by `timeoutMs`: a real browser
 * launch can hang (a stuck permission dialog, a corrupted install), and that
 * failure mode is real enough for real browsers to guard against explicitly.
 */
export async function runAcrossTiersInBrowser<Tier>(
  options: RunAcrossTiersInBrowserOptions<Tier>,
): Promise<RunAcrossTiersResult<Tier>> {
  const browserType = options.browserType ?? chromium;
  const timeoutMs = options.timeoutMs ?? DEFAULT_BROWSER_TIMEOUT_MS;

  const seenTiers = new Set<Tier>();
  for (const t of options.tiers) {
    if (seenTiers.has(t.tier)) {
      throw new Error(
        `tier-matrix/playwright: duplicate tier "${String(t.tier)}" in tiers — each tier must appear once.`,
      );
    }
    seenTiers.add(t.tier);
  }
  const configByTier = new Map<Tier, BrowserTier<Tier>>(options.tiers.map((t) => [t.tier, t]));

  let browser: Browser | undefined;
  let page: Page | undefined;

  return runAcrossTiers<Tier>({
    tiers: options.tiers.map((t) => t.tier),
    timeoutMs,
    mock: async (tier) => {
      const config = configByTier.get(tier);
      await withTimeout(
        async () => {
          browser = await browserType.launch(config?.launchOptions);
          const context = await browser.newContext(config?.contextOptions);
          page = await context.newPage();
        },
        timeoutMs,
        `tier-matrix/playwright: browser launch timed out after ${timeoutMs}ms for tier ${String(tier)}`,
      );
    },
    test: async (tier) => {
      if (!page) {
        throw new Error(`tier-matrix/playwright: no page was launched for tier ${String(tier)}`);
      }
      await options.test(page, tier);
    },
    cleanup: async () => {
      await page
        ?.context()
        .close()
        .catch(() => {});
      await browser?.close().catch(() => {});
      page = undefined;
      browser = undefined;
    },
  });
}
