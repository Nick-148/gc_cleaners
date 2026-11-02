import { expect, test } from '@playwright/test';
import { expectAccessible, waitForIslands, watchConsole } from './helpers';

const pages = [
  { path: '/', heading: /Pass inspection/ },
  { path: '/services', heading: /Flat prices/ },
  { path: '/fine-guide', heading: /Know what inspectors look for/ },
  { path: '/quote', heading: /Custom quote/ },
  { path: '/book', heading: /Book your cleaning/ },
  { path: '/join', heading: /keep 75% of every job/ },
  { path: '/contact', heading: /Get in touch/ },
  { path: '/privacy', heading: /Privacy policy/ },
  { path: '/terms', heading: /Terms of service/ },
];

for (const { path, heading } of pages) {
  test(`${path} renders, shows the disclaimer, passes axe and has no CSP/console errors`, async ({
    page,
  }) => {
    const errors = watchConsole(page);
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.getByTestId('disclaimer')).toContainText('not affiliated with');
    await waitForIslands(page);
    await expectAccessible(page);
    expect(errors).toEqual([]);
  });
}

test('unknown pages return a 404 with navigation home', async ({ page }) => {
  const response = await page.goto('/this-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('link', { name: 'Go home' })).toBeVisible();
});

test('static pages are served with security headers', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['strict-transport-security']).toContain('max-age=');
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['permissions-policy']).toContain('camera=()');
});

test('every page carries a strict meta Content-Security-Policy', async ({ page }) => {
  await page.goto('/book');
  const csp = await page
    .locator('meta[http-equiv="content-security-policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain('unsafe-inline');
  expect(csp).not.toContain('unsafe-eval');
});

test('the fine guide cites the official Gordon College source', async ({ page }) => {
  await page.goto('/fine-guide');
  const sources = page.locator('a[href="https://www.gordon.edu/studenthandbook/reslife"]');
  await expect(sources.first()).toBeVisible();
  await expect(page.getByText('$30').first()).toBeVisible();
});
