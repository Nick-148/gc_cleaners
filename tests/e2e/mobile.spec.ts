import { expect, test } from '@playwright/test';
import { waitForIslands } from './helpers';

const paths = [
  '/',
  '/services',
  '/fine-guide',
  '/quote',
  '/book',
  '/join',
  '/contact',
  '/privacy',
  '/terms',
];

for (const path of paths) {
  test(`${path} has no horizontal scrolling on a phone`, async ({ page }) => {
    await page.goto(path);
    await waitForIslands(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('the mobile menu opens, closes with Escape and returns focus', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Menu' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Contact' }),
  ).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Contact' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
});
