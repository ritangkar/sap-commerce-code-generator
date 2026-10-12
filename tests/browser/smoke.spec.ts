import { test, expect } from '@playwright/test';

test('landing renders both tools', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build cleaner SAP Commerce code');
  await expect(page.getByRole('link', { name: /Open OCC generator/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open ImpEx generator/ })).toBeVisible();
  expect(errors).toEqual([]);
});
