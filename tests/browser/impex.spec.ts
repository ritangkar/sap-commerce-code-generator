import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { codeText, external, trackRequests } from './helpers';

const out = (p: Page) => codeText(p, 'Generated ImpEx script');

test.beforeEach(async ({ page }) => {
  await page.goto('./#/impex-generator');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('initial workspace, modes, REMOVE warning', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'ImpEx Generator' })).toBeVisible();
  expect(await out(page)).toContain('INSERT_UPDATE Product;code[unique=true];name[lang=en]');
  for (const m of ['INSERT', 'UPDATE', 'REMOVE', 'INSERT_UPDATE']) {
    await page.getByRole('group', { name: 'Import mode' }).getByRole('button', { name: m, exact: true }).click();
    expect(await out(page)).toContain(`${m} Product;`);
    await expect(page.getByText('REMOVE is destructive')).toHaveCount(m === 'REMOVE' ? 1 : 0);
  }
});

test('type, modifiers order and raw expressions', async ({ page }) => {
  await page.getByLabel('Item type').fill('MyType');
  await page.getByLabel('Attribute of column 2').fill('supercategories(code,catalogVersion(catalog(id),version))');
  await page.getByLabel('Raw modifiers of column 2').fill('virtual=true');
  await page.getByLabel('Language of column 2').fill('de');
  await page.getByLabel('Default value of column 2').fill('x');
  const text = await out(page);
  expect(text).toContain('INSERT_UPDATE MyType;code[unique=true];supercategories(code,catalogVersion(catalog(id),version))[lang=de,default=x,virtual=true]');
});

test('macros: order, duplicates, undefined references, expansion', async ({ page }) => {
  await page.getByRole('tab', { name: /Macros/ }).click();
  await page.getByRole('button', { name: 'Add macro' }).click();
  await page.getByLabel('Name of macro 1').fill('a');
  await page.getByLabel('Value of macro 1').fill('one');
  await page.getByRole('button', { name: 'Add macro' }).click();
  await page.getByLabel('Name of macro 2').fill('a');
  await page.getByLabel('Value of macro 2').fill('$missing/$a');
  expect((await out(page)).split('\n').slice(0, 2)).toEqual(['$a=one', '$a=$missing/$a']);
  await page.getByRole('tab', { name: /Problems/ }).click();
  await expect(page.getByText(/defined more than once/)).toBeVisible();
  await expect(page.getByText(/undefined macro \$missing/)).toBeVisible();
  await expect(page.getByText(/Circular macro reference/)).toBeVisible();
  await page.getByRole('tab', { name: 'Macro expansion' }).click();
  await expect(page.getByRole('region', { name: 'Output' }).getByText('$a').first()).toBeVisible();
});

test('data rows: add, edit, duplicate, move, delete; empty cells; unicode and quoting', async ({ page }) => {
  await page.getByRole('tab', { name: /Data/ }).click();
  await page.getByRole('button', { name: 'Add row' }).click();
  await page.getByLabel('Row 2, code').fill('P-2');
  await page.getByLabel('Row 2, name').fill('Café; "quoted" 東京');
  await page.getByRole('button', { name: 'Duplicate row 2' }).click();
  await page.getByRole('button', { name: 'Move row 3 up' }).click();
  await page.getByRole('button', { name: 'Delete row 1' }).click();
  await page.getByLabel('Row 1, name').press('Shift+Enter');
  const text = await out(page);
  expect(text).toContain(';P-2;"Café; ""quoted"" 東京\n"');
  await page.getByLabel('Row 2, name').fill('');
  expect(await out(page)).toMatch(/^;P-2;$/m);
});

test('adding a column keeps data; removing a column with data asks first', async ({ page }) => {
  await page.getByRole('tab', { name: /Header/ }).click();
  await page.getByRole('button', { name: 'Add column' }).click();
  await page.getByLabel('Attribute of column 3').fill('description');
  expect(await out(page)).toContain(';P-1000;Sample product;');
  await page.getByRole('button', { name: 'Remove column 2' }).click();
  await expect(page.getByText(/discards those values/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await out(page)).toContain('name[lang=en]');
  await page.getByRole('button', { name: 'Remove column 2' }).click();
  await page.getByRole('button', { name: 'Remove and discard' }).click();
  expect(await out(page)).not.toContain('name[lang=en]');
});

async function openCsv(page: Page) {
  await page.getByRole('tab', { name: /Data/ }).click();
  await page.getByRole('button', { name: 'Import CSV / TSV…' }).click();
}

test('CSV import: quoted fields, unicode, mapping, append and replace with confirmation, cancel', async ({ page }) => {
  const urls = trackRequests(page);
  await openCsv(page);
  const csv = 'name,code\n"Camera, compact",C-1\n"Say ""hi""",C-2\nÜber 東京,C-3\n';
  await page.getByLabel('CSV file').setInputFiles({ name: 'p.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf-8') });
  await expect(page.getByText('3 data rows')).toBeVisible();
  await expect(page.getByLabel('CSV column for code')).toHaveValue('1'); // header-based mapping
  // cancel leaves data unchanged
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await out(page)).not.toContain('C-1');
  // append
  await openCsv(page);
  await page.getByLabel('CSV text').fill(csv);
  await page.getByRole('button', { name: /Append rows \(3\)/ }).click();
  let text = await out(page);
  expect(text).toContain(';C-1;"Camera, compact"'.replace('"Camera, compact"', 'Camera, compact'));
  expect(text).toContain(';C-2;"Say ""hi"""');
  expect(text).toContain(';C-3;Über 東京');
  expect(text).toContain(';P-1000;Sample product');
  // replace requires confirmation
  await openCsv(page);
  await page.getByLabel('CSV text').fill(csv);
  await page.getByLabel('Replace all rows').check();
  await page.getByRole('button', { name: /Replace data/ }).click();
  await expect(page.getByText(/replaces all/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).last().click();
  expect(await out(page)).toContain('P-1000');
  await page.getByRole('button', { name: /Replace data/ }).click();
  await page.getByRole('button', { name: 'Replace rows' }).click();
  text = await out(page);
  expect(text).not.toContain('P-1000');
  expect(text).toContain('C-3');
  expect(external(urls)).toEqual([]);
});

test('CSV without header row, semicolon delimiter, and malformed CSV leaves data untouched', async ({ page }) => {
  await openCsv(page);
  await page.getByLabel('First row is a header').uncheck();
  await page.getByLabel('CSV text').fill('X-1;Name 1\nX-2;Name 2');
  await expect(page.getByLabel('Delimiter')).toContainText('Semicolon');
  await page.getByRole('button', { name: /Append rows \(2\)/ }).click();
  expect(await out(page)).toContain(';X-2;Name 2');
  await openCsv(page);
  await page.getByLabel('CSV text').fill('a,"unterminated\nb,c');
  await expect(page.getByRole('alert')).toContainText('Unterminated');
  await expect(page.getByRole('button', { name: /Append rows/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(await out(page)).not.toContain('unterminated');
});

test('TSV paste into a cell fills rows and columns', async ({ page }) => {
  await page.getByRole('tab', { name: /Data/ }).click();
  await page.getByLabel('Row 1, code').focus();
  await page.evaluate(() => {
    const el = document.activeElement as HTMLTextAreaElement;
    const dt = new DataTransfer();
    dt.setData('text', 'T-1\tTab one\nT-2\tTab two\n');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  const text = await out(page);
  expect(text).toContain(';T-1;Tab one');
  expect(text).toContain(';T-2;Tab two');
});

test('row/header mismatch from loaded JSON blocks export', async ({ page }) => {
  await page.getByRole('button', { name: 'Configurations' }).click();
  const bad = JSON.stringify({ schema: 'sap-commerce-code-generator/impex-config', version: 1, name: 'bad', config: { mode: 'INSERT', type: 'Product', macros: [], columns: [{ attribute: 'code', unique: true }], rows: [['a', 'b']] } });
  await page.getByLabel('Import configuration JSON file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(bad) });
  await page.getByRole('button', { name: 'Replace' }).click();
  await expect(page.getByRole('button', { name: /\.impex/ })).toBeDisabled();
  await page.getByRole('tab', { name: /Problems/ }).click();
  await expect(page.getByText(/has 2 cells but the header has 1/)).toBeVisible();
});

test('download .impex and copy produce the generated script', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /\.impex/ }).click()]);
  expect(dl.suggestedFilename()).toBe('Product.impex');
  const content = readFileSync((await dl.path())!, 'utf8');
  expect(content).toBe('INSERT_UPDATE Product;code[unique=true];name[lang=en]\n;P-1000;Sample product\n');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(content);
});

test('save, load, rename, delete; JSON round trip; invalid JSON keeps state; reset needs confirmation', async ({ page }) => {
  await page.getByLabel('Item type').fill('Category');
  await page.getByRole('button', { name: 'Configurations' }).click();
  await page.getByLabel('Name', { exact: true }).fill('My cat');
  await page.getByRole('button', { name: 'Save current' }).click();
  await expect(page.getByText('My cat').first()).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
  const json = readFileSync((await dl.path())!, 'utf8');
  expect(JSON.parse(json).config.type).toBe('Category');
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('New name').fill('Renamed');
  await page.getByLabel('New name').press('Enter');
  await expect(page.getByText('Renamed', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Item type').fill('Other');
  await page.getByRole('button', { name: 'Configurations' }).click();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await page.getByRole('button', { name: 'Replace' }).click();
  await expect(page.getByLabel('Item type')).toHaveValue('Category');
  // invalid json does not overwrite
  await page.getByLabel('Item type').fill('Keep');
  await page.getByRole('button', { name: 'Configurations' }).click();
  await page.getByLabel('Import configuration JSON file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
  await expect(page.getByText(/Import failed/)).toBeVisible();
  await page.getByLabel('Import configuration JSON file').setInputFiles({ name: 'y.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ schema: 'wrong', version: 1, config: {} })) });
  await expect(page.getByText(/Wrong file type/)).toBeVisible();
  // valid import round trip
  await page.getByLabel('Import configuration JSON file').setInputFiles({ name: 'z.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.getByRole('button', { name: 'Replace' }).click();
  await expect(page.getByLabel('Item type')).toHaveValue('Category');
  // delete is explicit
  await page.getByRole('button', { name: 'Configurations' }).click();
  await page.getByRole('button', { name: 'Delete Renamed' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await expect(page.getByText('No saved configurations yet.')).toBeVisible();
  await page.keyboard.press('Escape');
  // reset confirmation
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Item type')).toHaveValue('Category');
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset' }).click();
  await expect(page.getByLabel('Item type')).toHaveValue('Product');
});

test('generation makes no external requests and has no execute/import actions', async ({ page }) => {
  const urls = trackRequests(page);
  await page.getByLabel('Item type').fill('Media');
  await page.getByRole('tab', { name: /Data/ }).click();
  await page.getByRole('button', { name: 'Add row' }).click();
  expect(external(urls)).toEqual([]);
  const actions = (await page.getByRole('button').allInnerTexts()).concat(await page.getByRole('link').allInnerTexts()).join(' | ').toLowerCase();
  expect(actions).not.toMatch(/execute|import to sap|deploy|apply to environment|run script/);
});
