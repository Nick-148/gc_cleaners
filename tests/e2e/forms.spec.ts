import { expect, test } from '@playwright/test';
import { expectAccessible, TINY_PNG, uniqueEmail, waitForTurnstile, watchConsole } from './helpers';

test('a student requests a quote with photos and the owner sees them', async ({ page }) => {
  const errors = watchConsole(page);
  await page.goto('/quote');
  await page.getByLabel('Full name').fill('Sam Lee');
  await page.getByLabel('Email').fill(uniqueEmail('quoter'));
  await page.getByLabel('What needs cleaning?').selectOption({ label: 'Bedroom and bathroom' });
  await page.getByLabel('Residence hall').selectOption({ label: 'Tavilla Hall' });
  await page
    .getByLabel('Describe the space and the job')
    .fill('Move-out clean: shower has mildew, carpet needs a deep vacuum, lots of dust.');
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'shower.png', mimeType: 'image/png', buffer: TINY_PNG },
    { name: 'floor.png', mimeType: 'image/png', buffer: TINY_PNG },
  ]);
  const attached = page.getByRole('list', { name: 'Attached photos' });
  await expect(attached.getByRole('listitem')).toHaveCount(2);
  await attached.getByRole('button', { name: 'Remove floor.png' }).click();
  await expect(attached.getByRole('listitem')).toHaveCount(1);
  await waitForTurnstile(page);
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Request my quote' }).click();
  await expect(page.getByRole('heading', { name: /Your quote request is in/ })).toBeFocused();
  const reference = (await page.getByTestId('quote-reference').textContent()) ?? '';
  expect(reference).toMatch(/^Q-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
  expect(errors).toEqual([]);

  await page.goto('/admin#quotes');
  const card = page.locator('li', { hasText: reference });
  const photo = card.getByRole('img', { name: `Quote ${reference}, attachment 1` });
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
});

test('a student applies to join the team', async ({ page }) => {
  await page.goto('/join');
  await page.getByLabel('Full name').fill('Avery Chen');
  await page.getByLabel('Email').fill(uniqueEmail('applicant'));
  await page.getByLabel('Mobile number').fill('(978) 555-0144');
  await page.getByLabel('Class year').selectOption({ label: 'Sophomore' });
  await page.getByLabel('Hours per week you could work').fill('6');
  await page.getByLabel('Monday').check();
  await page.getByLabel('Thursday').check();
  await page
    .getByLabel('Why do you want to join the team?')
    .fill('I like flexible hours and I am detail oriented.');
  await page.getByLabel(/cleaners keep 75%/).check();
  await waitForTurnstile(page);
  await page.getByRole('button', { name: 'Send application' }).click();
  await expect(page.getByRole('heading', { name: /Application received/ })).toBeFocused();
});

test('a student sends a reschedule request through the contact form', async ({ page }) => {
  await page.goto('/contact?topic=reschedule');
  await expect(page.getByLabel('Topic')).toHaveValue('reschedule');
  await page.getByLabel('Full name').fill('Riley Park');
  await page.getByLabel('Email').fill(uniqueEmail('contact'));
  await page.getByLabel(/Booking reference/).fill('sf-7k2q9m');
  await page.getByLabel('Message').fill('Could we move my cleaning to Thursday evening?');
  await waitForTurnstile(page);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByRole('heading', { name: 'Message sent' })).toBeFocused();

  await page.goto('/admin#messages');
  await expect(page.locator('li', { hasText: 'SF-7K2Q9M' }).first()).toContainText(
    'Could we move my cleaning to Thursday evening?',
  );
});

test('the admin schedule shows the weekly windows and is accessible', async ({ page }) => {
  await page.goto('/admin#schedule');
  await expect(page.getByRole('heading', { name: 'Weekly schedule' })).toBeVisible();
  await expect(page.locator('.admin-row__label', { hasText: 'Monday 4:00–6:00 PM' })).toBeVisible();
  await expectAccessible(page);
});
