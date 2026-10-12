import { expect, type Page } from '@playwright/test';

export const ORIGIN = 'http://localhost:4173';

/** Collects every request the page makes so tests can assert nothing leaves the origin. */
export function trackRequests(page: Page) {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  return urls;
}

export const external = (urls: string[]) => urls.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:'));

export async function codeLines(page: Page, label: string): Promise<string[]> {
  return page.locator(`[aria-label="${label}"] .lt`).allInnerTexts();
}

export async function codeText(page: Page, label: string): Promise<string> {
  return (await codeLines(page, label)).map((l) => l.split(String.fromCharCode(0x200b)).join('')).join('\n');
}

export async function noOverflow(page: Page) {
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(w.sw, `page scrollWidth ${w.sw} > clientWidth ${w.cw}`).toBeLessThanOrEqual(w.cw);
}
