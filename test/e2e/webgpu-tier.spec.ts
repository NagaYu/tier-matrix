import type { BrowserType } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { runAcrossTiersInBrowser } from '../../src/playwright.js';

test.describe('runAcrossTiersInBrowser', () => {
  test('detects navigator.gpu as unavailable when WebGPU is force-disabled via a real Chromium launch flag', async () => {
    // Two tiers, each a genuinely separate real browser process launched with
    // its own launchOptions — this is the mechanism under test: does
    // runAcrossTiersInBrowser correctly wire per-tier launchOptions through to
    // a real browser and let test() observe real navigator state (not a mock)?
    //
    // We only hard-assert the forced-off tier's navigator.gpu value. Many
    // CI/sandboxed runners have no GPU backend at all, so navigator.gpu can be
    // unavailable by default too, with or without --disable-webgpu (verified
    // in this environment across several ANGLE/Vulkan flag combinations) —
    // asserting a specific value for the 'default' tier would be
    // environment-dependent. The forced-off assertion is unconditionally
    // correct regardless of that, and is the concrete case the project brief
    // requires.
    //
    // Separately, a custom userAgent per tier (via contextOptions, hardware
    // independent) proves each tier's config actually reached a genuinely
    // fresh browser context — without this, a broken implementation that
    // reused one browser/context for every tier could still make the
    // navigator.gpu assertion above pass in a GPU-less sandbox for the wrong
    // reason (no GPU backend at all, regardless of whether the flag applied).
    const result = await runAcrossTiersInBrowser({
      tiers: [
        { tier: 'default', contextOptions: { userAgent: 'tier-matrix-e2e/default' } },
        {
          tier: 'webgpu-forced-off',
          launchOptions: { args: ['--disable-webgpu'] },
          contextOptions: { userAgent: 'tier-matrix-e2e/webgpu-forced-off' },
        },
      ],
      test: async (page, tier) => {
        await page.setContent('<!doctype html><html><body></body></html>');
        const [hasGpu, userAgent] = await page.evaluate(() => [
          Boolean((navigator as unknown as { gpu?: unknown }).gpu),
          navigator.userAgent,
        ]);
        expect(userAgent).toBe(`tier-matrix-e2e/${tier}`);
        if (tier === 'webgpu-forced-off') {
          expect(hasGpu).toBe(false);
        }
      },
    });

    expect(result.allPassed).toBe(true);
    expect(result.results.map((r) => r.tier)).toEqual(['default', 'webgpu-forced-off']);
    expect(result.results.map((r) => r.status)).toEqual(['pass', 'pass']);
  });

  test('isolates tiers at the browser level — cookies set in one tier never appear in the next', async () => {
    const seenCookieValues: (string | undefined)[] = [];

    const result = await runAcrossTiersInBrowser({
      tiers: [{ tier: 'tier-a' }, { tier: 'tier-b' }],
      test: async (page) => {
        await page.goto('about:blank');
        const cookies = await page.context().cookies('https://example.com');
        seenCookieValues.push(cookies[0]?.value);
        await page.context().addCookies([
          {
            name: 'tier-matrix-leak-check',
            value: 'set-by-this-tier',
            url: 'https://example.com',
          },
        ]);
      },
    });

    expect(result.allPassed).toBe(true);
    // If runAcrossTiersInBrowser reused a browser/context across tiers instead
    // of launching fresh ones, tier-b would see tier-a's cookie here.
    expect(seenCookieValues).toEqual([undefined, undefined]);
  });

  test('isolates a tier that fails from a later, healthy tier', async () => {
    const result = await runAcrossTiersInBrowser({
      tiers: [{ tier: 'broken' }, { tier: 'healthy' }],
      test: async (page, tier) => {
        await page.setContent('<!doctype html><html><body></body></html>');
        if (tier === 'broken') {
          throw new Error('simulated page-level failure');
        }
      },
    });

    expect(result.results[0]).toMatchObject({ tier: 'broken', status: 'fail' });
    expect((result.results[0]?.error as Error).message).toBe('simulated page-level failure');
    expect(result.results[1]).toMatchObject({ tier: 'healthy', status: 'pass' });
  });

  test('rejects a tiers list with duplicate tier values before launching anything', async () => {
    await expect(
      runAcrossTiersInBrowser({
        tiers: [{ tier: 'x' }, { tier: 'y' }, { tier: 'x' }],
        test: async () => {},
      }),
    ).rejects.toThrow('duplicate tier "x"');
  });

  test('bounds a hanging browser launch by timeoutMs instead of hanging forever', async () => {
    const neverLaunches = {
      launch: () => new Promise<never>(() => {}),
    } as unknown as BrowserType;

    const result = await runAcrossTiersInBrowser({
      tiers: [{ tier: 'stuck' }],
      browserType: neverLaunches,
      timeoutMs: 50,
      test: async () => {},
    });

    expect(result.results[0]).toMatchObject({ tier: 'stuck', status: 'fail' });
    expect((result.results[0]?.error as Error).message).toContain('browser launch timed out');
  });
});
