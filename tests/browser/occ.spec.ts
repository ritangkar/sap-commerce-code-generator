import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { codeText, external, trackRequests } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('./#/occ-generator');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

const preview = (p: Page) => codeText(p, 'Generated Java preview');

test('profiles change generated annotations', async ({ page }) => {
  await page.getByRole('button', { name: 'SAP Commerce 2205' }).click();
  await page.getByLabel('Preview file').selectOption({ index: 0 });
  expect(await preview(page)).toContain('import io.swagger.annotations.ApiOperation;');
  await page.getByRole('button', { name: 'SAP Commerce 2211' }).click();
  expect(await preview(page)).toContain('import io.swagger.v3.oas.annotations.Operation;');
  await expect(page.getByText(/Profile 2211/)).toBeVisible();
});

test('invalid identifiers produce errors and block ZIP export', async ({ page }) => {
  await page.getByLabel('Java package').fill('1bad..pkg');
  await expect(page.getByText(/not a valid Java package name/)).toBeVisible();
  await page.getByRole('tab', { name: /Generated Code/ }).click();
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toBeDisabled();
  await page.getByRole('tab', { name: 'Builder' }).click();
  await page.getByLabel('Java package').fill('com.acme.occ');
  await page.getByRole('tab', { name: /Generated Code/ }).click();
  await expect(page.getByRole('button', { name: /Download ZIP/ })).toBeEnabled();
});

test('path variable consistency, duplicate params, default/type check', async ({ page }) => {
  await page.getByLabel('Endpoint path').fill('/{id}/x');
  await expect(page.getByText(/placeholder \{id\} has no matching path variable/)).toBeVisible();
  await page.getByRole('button', { name: /Add path variable: id/ }).click();
  await expect(page.getByText(/placeholder \{id\}/)).toHaveCount(0);
  await expect(page.getByText(/path variable "noteCode" does not appear/)).toBeVisible();
  // parameter 2 is the Boolean query param with default "false": break it
  await page.getByLabel('Default of parameter 2').fill('maybe');
  await expect(page.getByText(/not a valid Boolean/)).toBeVisible();
});

test('all HTTP methods generate mappings', async ({ page }) => {
  for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    await page.getByLabel('HTTP method').selectOption(m);
    expect(await preview(page)).toContain(`RequestMethod.${m}`);
  }
});

test('ZIP and single-file downloads', async ({ page }) => {
  await page.getByRole('tab', { name: /Generated Code/ }).click();
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download ZIP/ }).click()]);
  expect(zip.suggestedFilename()).toBe('ProductNotesController-2211.zip');
  const buf = readFileSync((await zip.path())!);
  const text = buf.toString('latin1');
  for (const n of ['README.md', 'ProductNotesController.java', 'ProductNoteWsDTO.java', 'ProductNotesFacade.java', 'DefaultProductNotesFacade.java', 'ProductNotesValidator.java']) expect(text).toContain(n);
  expect(text).toContain('SAP Commerce 2211');
  expect(buf.readUInt32LE(0)).toBe(0x04034b50);
  const [java] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download .java' }).click()]);
  expect(java.suggestedFilename()).toBe('ProductNotesController.java');
  expect(readFileSync((await java.path())!, 'utf8')).toContain('public class ProductNotesController');
});

test('optional facade/validator/DTO can be switched off', async ({ page }) => {
  await page.getByText('Request / supporting DTO').click();
  await page.getByLabel('Generate a WsDTO class').uncheck();
  await page.getByText('Facade & validator skeletons').click();
  await page.getByLabel(/Generate facade/).uncheck();
  await page.getByLabel('Generate validator').uncheck();
  await page.getByRole('tab', { name: /Generated Code \(1\)/ }).click();
});

test('mock tester: matching, params, bodies, errors, determinism, no network', async ({ page }) => {
  await page.getByRole('tab', { name: 'Mock Test' }).click();
  const urls = trackRequests(page);
  await expect(page.getByText('MOCK SIMULATION')).toBeVisible();
  const run = () => page.getByRole('button', { name: /Run mock request/ }).click();
  await run();
  const result = page.getByRole('region', { name: 'Mock result' });
  await expect(result).toContainText('200 OK');
  await expect(result).toContainText('getNote');
  await expect(result).toContainText('noteCode=N-100');
  await expect(result).toContainText('"code": "N-100"');
  // 404
  await page.getByLabel('Request path (relative to the OCC root)').fill('/electronics/unknown');
  await run();
  await expect(result).toContainText('404 Not Found');
  // 405
  await page.getByLabel('Request path (relative to the OCC root)').fill('/electronics/product-notes/N-1');
  await page.getByRole('combobox', { name: /^Method/ }).selectOption('DELETE');
  await run();
  await expect(result).toContainText('405');
  // POST with malformed JSON
  await page.getByRole('combobox', { name: /^Method/ }).selectOption('POST');
  await page.getByLabel('Request path (relative to the OCC root)').fill('/electronics/product-notes');
  await page.getByLabel('JSON request body (optional)').fill('{"code":');
  await run();
  await expect(result).toContainText('Malformed JSON');
  // valid body -> configured 201
  await page.getByLabel('JSON request body (optional)').fill('{"code":"a","text":"b"}');
  await run();
  await expect(result).toContainText('201 Created');
  // configured status and header
  await page.getByLabel('Status code').fill('418');
  await page.getByLabel('Response headers name 1').fill('X-Mock');
  await page.getByLabel('Response headers value 1').fill('yes');
  await run();
  await expect(result).toContainText('418');
  await expect(result).toContainText('X-Mock');
  expect(external(urls)).toEqual([]);
  expect(urls.filter((u) => !/\.(js|css|svg)(\?|$)/.test(u))).toEqual([]);
});

test('Java import: supported syntax, diagnostics, original preserved until applied', async ({ page }) => {
  const src = readFileSync('tests/fixtures/ImportMe.java', 'utf8');
  await page.getByRole('button', { name: 'Import Java' }).click();
  await page.getByLabel('Java source').fill(src);
  await page.getByRole('button', { name: 'Parse', exact: true }).click();
  await expect(page.getByText(/Parsed 2 endpoint/)).toBeVisible();
  await expect(page.getByText(/Method body of list\(\)/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Imported original source' })).toContainText('class OrderNotesController');
  // builder unchanged until applied
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByLabel('Controller class name')).toHaveValue('ProductNotesController');
  await page.getByRole('button', { name: 'Import Java' }).click();
  await page.getByRole('button', { name: /Apply to builder/ }).click();
  await page.getByRole('button', { name: 'Replace builder' }).click();
  await expect(page.getByLabel('Controller class name')).toHaveValue('OrderNotesController');
  // original source remains reachable on the generated tab
  await page.getByRole('tab', { name: /Generated Code/ }).click();
  await expect(page.getByText('Imported source (original)')).toBeVisible();
});

test('Java import: malformed source is reported and does not change the builder', async ({ page }) => {
  await page.getByRole('button', { name: 'Import Java' }).click();
  await page.getByLabel('Java source').fill('public class Broken { void x() {');
  await page.getByRole('button', { name: 'Parse', exact: true }).click();
  await expect(page.getByText(/could not be converted/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Apply to builder/ })).toBeDisabled();
});

test('save/load, JSON invalid import, reset confirmation', async ({ page }) => {
  await page.getByLabel('Controller class name').fill('SavedController');
  await page.getByRole('button', { name: 'Configurations' }).click();
  await page.getByRole('button', { name: 'Save current' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
  const json = readFileSync((await dl.path())!, 'utf8');
  expect(JSON.parse(json).config.controllerName).toBe('SavedController');
  await page.keyboard.press('Escape');
  await page.getByLabel('Controller class name').fill('Changed');
  await page.getByRole('button', { name: 'Configurations' }).click();
  await page.getByLabel('Import configuration JSON file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await expect(page.getByText(/Import failed/)).toBeVisible();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Replace' }).click();
  await expect(page.getByLabel('Controller class name')).toHaveValue('SavedController');
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Controller class name')).toHaveValue('SavedController');
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByLabel('Controller class name')).toHaveValue('ProductNotesController');
});
