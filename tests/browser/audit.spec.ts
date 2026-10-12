import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { external, trackRequests } from './helpers';

/** Wrap every network-capable browser API so any use by app code is recorded. */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __net: string[] };
    w.__net = [];
    const rec = (k: string) => w.__net.push(k);
    const f = window.fetch;
    window.fetch = (...a: Parameters<typeof fetch>) => { rec('fetch ' + String(a[0])); return f.apply(window, a); };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...a: unknown[]) { rec('xhr ' + String(a[1])); return (open as (...x: unknown[]) => void).apply(this, a); };
    const WS = window.WebSocket;
    window.WebSocket = function (...a: ConstructorParameters<typeof WebSocket>) { rec('ws ' + a[0]); return new WS(...a); } as unknown as typeof WebSocket;
    navigator.sendBeacon = (u: string | URL) => { rec('beacon ' + String(u)); return false; };
  });
}
const netCalls = (page: Page) => page.evaluate(() => (window as unknown as { __net: string[] }).__net);

test('full workflows use no fetch/XHR/WebSocket/beacon, no off-origin requests and log no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await instrument(page);
  const urls = trackRequests(page);
  await page.goto('./#/occ-generator');
  await page.getByRole('tab', { name: 'Mock Test' }).click();
  await page.getByRole('button', { name: /Run mock request/ }).click();
  await expect(page.getByRole('region', { name: 'Mock result' })).toContainText('200 OK');
  await page.getByRole('tab', { name: /Generated Code/ }).click();
  await page.getByRole('button', { name: /Download ZIP/ }).click();
  await page.getByRole('button', { name: 'Import Java' }).click();
  await page.getByLabel('Java source').fill('@Controller @RequestMapping("/x") public class X { @GetMapping("/a") public String a() { return null; } }');
  await page.getByRole('button', { name: 'Parse', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto('./#/impex-generator');
  await page.getByRole('tab', { name: /Data/ }).click();
  await page.getByRole('button', { name: 'Import CSV / TSV…' }).click();
  await page.getByLabel('CSV text').fill('code,name\nA,B');
  await page.getByRole('button', { name: /Append rows/ }).click();
  await page.getByRole('button', { name: /\.impex/ }).click();
  expect(await netCalls(page)).toEqual([]);
  expect(external(urls)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const route of ['./', './#/occ-generator', './#/impex-generator']) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`axe: no serious/critical accessibility violations on ${route} (${scheme})`, async ({ browser }) => {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto(route);
      await page.waitForTimeout(300);
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
      await ctx.close();
    });
  }
}

test('corrupted stored drafts and saved lists are ignored without crashing or deleting', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.setItem('scg:v1:draft:impex', '{bad json');
    localStorage.setItem('scg:v1:draft:occ', JSON.stringify({ profile: '1905', endpoints: 'x' }));
    localStorage.setItem('scg:v1:saved:impex', JSON.stringify([{ id: '1', name: 'broken', savedAt: 'x', config: { mode: 'NOPE' } }]));
  });
  await page.goto('./#/impex-generator');
  await page.reload();
  await expect(page.getByLabel('Item type')).toHaveValue('Product'); // default used
  await page.getByRole('button', { name: 'Configurations' }).click();
  await expect(page.getByRole('alert')).toContainText('could not be read');
  const kept = await page.evaluate(() => localStorage.getItem('scg:v1:saved:impex'));
  expect(kept).toContain('broken'); // never auto-deleted
  await page.keyboard.press('Escape');
  await page.goto('./#/occ-generator');
  await page.reload();
  await expect(page.getByLabel('Controller class name')).toHaveValue('ProductNotesController');
  expect(errors).toEqual([]);
});

test('dialogs and mock tester are usable on a phone without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/impex-generator');
  await page.getByRole('tab', { name: /Data/ }).click();
  await page.getByRole('button', { name: 'Import CSV / TSV…' }).click();
  await page.getByLabel('CSV text').fill('code,name\nA,B');
  const box = await page.getByRole('dialog').boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: /Append rows/ }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: /Append rows/ }).click();
  await page.goto('./#/occ-generator');
  await page.getByRole('tab', { name: 'Mock Test' }).click();
  await page.getByRole('button', { name: /Run mock request/ }).click();
  await expect(page.getByRole('region', { name: 'Mock result' })).toContainText('200 OK');
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  expect(w[0]).toBeLessThanOrEqual(w[1]);
});
