import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Fails on serious/critical WCAG 2.2 A/AA violations (ADR 0010). */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    // Third-party Turnstile iframe content is outside our control.
    .exclude('iframe[src*="challenges.cloudflare.com"]')
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(blocking).toEqual([]);
}

/**
 * Collects console errors and uncaught exceptions from our own origin. A CSP violation
 * shows up here as a console error, so this doubles as a CSP regression check.
 */
export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.location().url.includes('challenges.cloudflare.com')) return;
    errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * Waits until client islands have replaced their loading fallbacks. (Turnstile keeps a
 * connection open, so "networkidle" never settles on pages with forms.)
 */
export async function waitForIslands(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await expect(page.locator('.island-fallback')).toHaveCount(0);
}

export async function waitForTurnstile(page: Page): Promise<void> {
  await expect(page.getByTestId('turnstile')).toHaveAttribute('data-state', 'verified', {
    timeout: 30_000,
  });
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.edu`;
}

/** A valid 1×1 PNG. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
