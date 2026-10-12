import { expect, test } from '@playwright/test';
import { external, noOverflow, trackRequests } from './helpers';

test('landing presents both tools and navigation works with back/forward', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const urls = trackRequests(page);
  await page.goto('./');
  await page.getByRole('link', { name: /Open OCC generator/ }).click();
  await expect(page).toHaveURL(/#\/occ-generator$/);
  await expect(page.getByRole('heading', { name: /OCC Controller Generator/ })).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: /Open ImpEx generator/ }).click();
  await expect(page).toHaveURL(/#\/impex-generator$/);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build cleaner');
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'ImpEx Generator' })).toBeVisible();
  expect(errors).toEqual([]);
  expect(external(urls)).toEqual([]);
});

test('direct navigation, refresh under the GitHub Pages sub-path, and not-found', async ({ page }) => {
  await page.goto('./#/impex-generator');
  await expect(page.getByRole('heading', { name: 'ImpEx Generator' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'ImpEx Generator' })).toBeVisible();
  await page.goto('./#/occ-generator');
  await page.reload();
  await expect(page.getByRole('heading', { name: /OCC Controller Generator/ })).toBeVisible();
  await page.goto('./#/nope');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to home' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // assets must resolve beneath the sub-path
  expect(page.url()).toContain('/sap-commerce-code-generator/');
});

test('work survives switching tools', async ({ page }) => {
  await page.goto('./#/impex-generator');
  await page.getByLabel('Item type').fill('MyCustomType');
  await page.getByRole('link', { name: 'OCC Controller' }).click();
  await page.getByRole('link', { name: 'ImpEx', exact: true }).click();
  await expect(page.getByLabel('Item type')).toHaveValue('MyCustomType');
  await page.reload();
  await expect(page.getByLabel('Item type')).toHaveValue('MyCustomType'); // persisted draft
});

for (const [name, size] of [['mobile', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1100 }]] as const) {
  test(`no page-level horizontal overflow on ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    for (const r of ['./', './#/impex-generator', './#/occ-generator', './#/nope']) {
      await page.goto(r);
      await page.waitForTimeout(150);
      await noOverflow(page);
    }
    await page.goto('./#/impex-generator');
    await page.getByRole('tab', { name: /Data/ }).click();
    await noOverflow(page);
    await page.goto('./#/occ-generator');
    await page.getByRole('tab', { name: 'Mock Test' }).click();
    await noOverflow(page);
    await page.getByRole('tab', { name: /Generated Code/ }).click();
    await noOverflow(page);
  });
}

test('keyboard focus is visible and tabs support arrow keys', async ({ page }) => {
  await page.goto('./#/occ-generator');
  await page.getByRole('tab', { name: 'Builder' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Generated Code/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
  expect(outline).not.toBe('none');
});

test('inputs have accessible names', async ({ page }) => {
  for (const r of ['./#/impex-generator', './#/occ-generator']) {
    await page.goto(r);
    const unnamed = await page.evaluate(() =>
      [...document.querySelectorAll('input:not([type=hidden]), select, textarea')]
        .filter((el) => { const e = el as HTMLInputElement; return !(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby'); })
        .map((el) => el.outerHTML.slice(0, 120)));
    expect(unnamed).toEqual([]);
  }
});

test('theme toggle persists and reduced motion disables animation', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('./');
  await page.getByRole('button', { name: /Switch to (dark|light) theme/ }).click();
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.btn') ?? document.body).transitionDuration);
  expect(parseFloat(dur)).toBeLessThan(0.01);
  await ctx.close();
});

test('app still works when browser storage throws', async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    const boom = () => { throw new Error('storage blocked'); };
    Object.defineProperty(window, 'localStorage', { get: boom });
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#/impex-generator');
  await page.getByLabel('Item type').fill('Category');
  await page.getByRole('link', { name: 'OCC Controller' }).click();
  await page.getByRole('link', { name: 'ImpEx', exact: true }).click();
  await expect(page.getByLabel('Item type')).toHaveValue('Category'); // in-memory fallback
  await page.getByRole('button', { name: 'Configurations' }).click();
  await page.getByRole('button', { name: 'Save current' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  expect(errors).toEqual([]);
  await ctx.close();
});
