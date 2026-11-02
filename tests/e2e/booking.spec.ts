import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, uniqueEmail, waitForTurnstile, watchConsole } from './helpers';

async function pickFirstOpenSlot(page: Page): Promise<void> {
  const days = page.getByRole('radiogroup', { name: 'Day' });
  await days.getByRole('radio', { disabled: false }).first().check();
  const windows = page.getByRole('radiogroup', { name: /Time window on/ });
  await windows.getByRole('radio', { disabled: false }).first().check();
}

async function fillDetails(page: Page, email: string): Promise<void> {
  await page.getByLabel('Full name').fill('Jordan Rivera');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mobile number').fill('978-555-0123');
  await page.getByLabel('Residence hall').selectOption({ label: 'Chase Hall' });
  await page.getByLabel('Room or apartment number').fill('214B');
  await page.getByRole('radio', { name: /Venmo/ }).check();
}

test('a student books a cleaning and the owner confirms it in the admin dashboard', async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.goto('/book?package=bundle');
  await expect(page.getByRole('radio', { name: /Room \+ Bathroom/ })).toBeChecked();
  await pickFirstOpenSlot(page);
  await fillDetails(page, uniqueEmail('booker'));
  await page.getByLabel(/I’ll pay \$60 in person/).check();
  await page.getByLabel(/Someone who lives in the room will be there/).check();
  await waitForTurnstile(page);
  await expectAccessible(page);

  await page.getByRole('button', { name: 'Book for $60' }).click();

  const heading = page.getByRole('heading', { name: 'You’re booked!' });
  await expect(heading).toBeVisible();
  await expect(heading).toBeFocused();
  const reference = (await page.getByTestId('booking-reference').textContent()) ?? '';
  expect(reference).toMatch(/^SF-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
  await expect(page.getByRole('link', { name: 'Add to calendar' })).toHaveAttribute(
    'download',
    `scot-free-${reference}.ics`,
  );
  expect(errors).toEqual([]);

  // Owner view (local dev bypass stands in for Cloudflare Access).
  await page.goto('/admin');
  await expect(page.getByText('Signed in as')).toContainText('admin@example.com');
  const card = page.locator('li', { hasText: reference });
  await expect(card).toContainText('pending');
  await card.getByRole('button', { name: `Confirm booking ${reference}` }).click();
  await expect(card).toContainText('confirmed');
  await expect(page.getByRole('status').filter({ hasText: 'confirm done' })).toBeVisible();
  await expectAccessible(page);
});

test('the form explains what to fix and moves focus to the first problem', async ({ page }) => {
  await page.goto('/book');
  await expect(page.getByRole('radiogroup', { name: 'Day' })).toBeVisible();
  await page.getByRole('button', { name: /^Book for/ }).click();

  await expect(
    page.getByRole('alert').filter({ hasText: 'Please fix the highlighted fields' }),
  ).toBeVisible();
  const focused = page.locator(':focus');
  await expect(focused).toHaveAttribute('name', 'date');
  await expect(page.getByText('Enter your full name.')).toBeVisible();
  await expect(
    page.getByText('Please confirm you will pay in person with cash or Venmo.'),
  ).toBeVisible();

  await page.getByLabel('Email').fill('not-an-email');
  await page.getByRole('button', { name: /^Book for/ }).click();
  await expect(page.getByText('Enter a valid email address, like name@gordon.edu.')).toBeVisible();
});

test('bathroom packages are unavailable in halls with shared floor bathrooms', async ({ page }) => {
  await page.goto('/book?package=room');
  await page.getByLabel('Residence hall').selectOption({ label: 'Ferrin Hall' });
  await expect(page.getByText('Ferrin Hall has shared floor bathrooms')).toBeVisible();
  await expect(page.getByRole('radio', { name: /Bathroom Clean/ })).toBeDisabled();
  await expect(page.getByRole('radio', { name: /Room \+ Bathroom/ })).toBeDisabled();
  await expect(page.getByRole('radio', { name: /^Room Clean/ })).toBeEnabled();
});
