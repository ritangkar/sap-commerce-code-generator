import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { serializeImpex, escapeCell } from '../../src/features/impex/serializer';
import { validateImpex, expandMacros, macroDefs } from '../../src/features/impex/validate';
import { TEMPLATES } from '../../src/features/impex/templates';
import { parseCsv, detectDelimiter, applyCsvImport, autoMap } from '../../src/features/impex/csv';
import { addColumn, removeColumn, moveColumn, moveRow, duplicateRow, deleteRow, addRow, setCell, defaultConfig, parseImpexConfig, discardedCells, pasteMatrix, emptyColumn, type ImpexConfig } from '../../src/features/impex/model';
import { makeEnvelope, parseEnvelope } from '../../src/shared/storage';

const product = () => structuredClone(TEMPLATES[0].config);
const codes = (c: ImpexConfig) => validateImpex(c).map((d) => d.code);

describe('serializer', () => {
  it('matches the approved fixture', () => {
    expect(serializeImpex(product()).text).toBe(readFileSync('tests/fixtures/impex-product.impex', 'utf8'));
  });
  it('is deterministic', () => {
    expect(serializeImpex(product()).text).toBe(serializeImpex(structuredClone(product())).text);
  });
  it.each(['INSERT_UPDATE', 'INSERT', 'UPDATE', 'REMOVE'] as const)('supports mode %s', (mode) => {
    const c = { ...defaultConfig(), mode };
    expect(serializeImpex(c).lines.find((l) => l.startsWith(mode + ' '))).toBeTruthy();
  });
  it('orders modifiers canonically and keeps raw ones verbatim', () => {
    const c = defaultConfig();
    c.columns = [{ attribute: 'name', unique: true, lang: 'en', allowNull: true, defaultValue: 'x', rawModifiers: 'virtual=true,translator=a.B' }];
    expect(serializeImpex(c).lines[0]).toBe('INSERT_UPDATE Product;name[unique=true,lang=en,allownull=true,default=x,virtual=true,translator=a.B]');
  });
  it('preserves reference expressions and macro refs untouched', () => {
    const c = defaultConfig();
    c.columns = [{ ...emptyColumn('supercategories(code,catalogVersion(catalog(id),version))') }];
    c.rows = [['$catalog:$version']];
    expect(serializeImpex(c).text).toContain('supercategories(code,catalogVersion(catalog(id),version))');
    expect(serializeImpex(c).text).toContain(';$catalog:$version');
  });
  it('preserves macro order', () => {
    const c = defaultConfig();
    c.macros = [{ name: 'b', value: '2' }, { name: 'a', value: '1' }];
    const l = serializeImpex(c).lines;
    expect(l[0]).toBe('$b=2');
    expect(l[1]).toBe('$a=1');
  });
  it('quotes cells with delimiters, quotes and newlines; keeps unicode and empties', () => {
    expect(escapeCell('a;b')).toBe('"a;b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell('')).toBe('');
    expect(escapeCell('Müller 東京 😀')).toBe('Müller 東京 😀');
    const c = defaultConfig();
    c.rows = [['A', 'line1\nline2']];
    const s = serializeImpex(c);
    expect(s.text).toContain(';A;"line1\nline2"');
    c.rows = [['A', 'x'], ['B', 'y']];
    expect(serializeImpex(c).rowLines).toEqual([2, 3]);
    c.rows = [['A', 'l1\nl2'], ['B', 'y']];
    expect(serializeImpex(c).rowLines).toEqual([2, 4]);
  });
  it('writes explicit empty cells', () => {
    const c = defaultConfig();
    c.rows = [['A', '']];
    expect(serializeImpex(c).lines[1]).toBe(';A;');
  });
});

describe('validation', () => {
  it('flags missing type, no columns', () => {
    const c = { ...defaultConfig(), type: '', columns: [], rows: [] };
    expect(codes(c)).toContain('type.missing');
    expect(codes(c)).toContain('columns.none');
  });
  it('warns on REMOVE and custom types', () => {
    expect(codes({ ...defaultConfig(), mode: 'REMOVE' })).toContain('mode.remove');
    expect(codes({ ...defaultConfig(), type: 'MyCustomType' })).toContain('type.unverified');
  });
  it('diagnoses duplicate, undefined and circular macros', () => {
    const c = defaultConfig();
    c.macros = [{ name: 'a', value: '$b' }, { name: 'b', value: '$a' }, { name: 'a', value: 'x$nope' }];
    const k = codes(c);
    expect(k).toContain('macro.duplicate');
    expect(k).toContain('macro.undefined');
    expect(k).toContain('macro.circular');
  });
  it('diagnoses invalid macro names and expressions', () => {
    const c = defaultConfig();
    c.macros = [{ name: '1x', value: 'v' }];
    c.columns = [{ ...emptyColumn('a(b'), }, emptyColumn('a(b'), emptyColumn('x(,)')];
    c.rows = [];
    const k = codes(c);
    expect(k).toContain('macro.syntax');
    expect(k).toContain('column.expression');
    expect(k).toContain('column.duplicate');
    expect(k).toContain('column.incompleteref');
  });
  it('reports row length mismatches and empty keys', () => {
    const c = defaultConfig();
    c.rows = [['only-one'], ['', 'n']];
    const d = validateImpex(c);
    expect(d.find((x) => x.code === 'row.length')?.severity).toBe('error');
    expect(d.find((x) => x.code === 'cell.emptykey')).toBeTruthy();
  });
  it('requires a unique key for UPDATE modes', () => {
    const c = defaultConfig();
    c.columns = [emptyColumn('name')];
    c.rows = [];
    expect(codes(c)).toContain('keys.missing');
  });
  it('template valid with no errors', () => {
    for (const t of TEMPLATES) expect(validateImpex(t.config).filter((d) => d.severity === 'error')).toEqual([]);
  });
  it('expands macros for preview only', () => {
    const defs = macroDefs(product());
    expect(expandMacros('$catalog:$version', defs)).toBe('electronicsProductCatalog:Staged');
  });
});

describe('csv', () => {
  it('parses quoted fields, delimiters, escaped quotes, newlines', () => {
    const r = parseCsv('a,b,c\n"x,1","say ""hi""","l1\nl2"\n');
    expect(r.rows).toEqual([['a', 'b', 'c'], ['x,1', 'say "hi"', 'l1\nl2']]);
    expect(r.fatal).toBe(false);
  });
  it('handles CRLF, BOM, unicode, empty fields, no trailing newline', () => {
    const r = parseCsv('﻿code,name\r\nA,Müller 東京\r\nB,');
    expect(r.rows).toEqual([['code', 'name'], ['A', 'Müller 東京'], ['B', '']]);
  });
  it('flags unterminated quotes as fatal', () => {
    const r = parseCsv('a,"b\nc');
    expect(r.fatal).toBe(true);
    expect(r.rows).toEqual([]);
  });
  it('reports ragged rows without truncating', () => {
    const r = parseCsv('a,b,c\n1,2,3,4\n');
    expect(r.rows[1]).toHaveLength(4);
    expect(r.issues.some((i) => i.severity === 'warning')).toBe(true);
  });
  it('detects delimiters', () => {
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\n1\t2')).toBe('\t');
    expect(detectDelimiter('a,b\n"1,5",2')).toBe(',');
  });
  it('imports with header / without header, append and replace', () => {
    const c = defaultConfig();
    const withHeader = parseCsv('name,code\nN1,C1\nN2,C2').rows;
    const m = autoMap(c, withHeader[0], 2);
    expect(m).toEqual([1, 0]);
    const rep = applyCsvImport(c, withHeader, { hasHeader: true, mapping: m, mode: 'replace' });
    expect(rep.rows).toEqual([['C1', 'N1'], ['C2', 'N2']]);
    const app = applyCsvImport(c, withHeader, { hasHeader: true, mapping: m, mode: 'append' });
    expect(app.rows).toHaveLength(3);
    const noHeader = applyCsvImport(c, withHeader, { hasHeader: false, mapping: [0, 1], mode: 'replace' });
    expect(noHeader.rows).toHaveLength(3);
    expect(c.rows).toEqual([['P-1000', 'Sample product']]); // original untouched
  });
});

describe('editing operations', () => {
  const base = () => { const c = defaultConfig(); c.rows = [['A', 'a'], ['B', 'b']]; return c; };
  it('rows: add, edit, duplicate, delete, move', () => {
    let c = addRow(base());
    expect(c.rows).toHaveLength(3);
    c = setCell(c, 2, 0, 'C');
    c = duplicateRow(c, 2);
    expect(c.rows.map((r) => r[0])).toEqual(['A', 'B', 'C', 'C']);
    c = moveRow(c, 3, 0);
    expect(c.rows[0][0]).toBe('C');
    c = deleteRow(c, 0);
    expect(c.rows).toHaveLength(3);
  });
  it('columns: add keeps data, remove reports discards, move permutes cells', () => {
    let c = addColumn(base(), emptyColumn('desc'), 1);
    expect(c.rows[0]).toEqual(['A', '', 'a']);
    expect(discardedCells(c, 2)).toBe(2);
    expect(discardedCells(c, 1)).toBe(0);
    c = moveColumn(c, 2, 0);
    expect(c.columns[0].attribute).toBe('name');
    expect(c.rows[0]).toEqual(['a', 'A', '']);
    c = removeColumn(c, 2);
    expect(c.rows[0]).toEqual(['a', 'A']);
  });
  it('paste reports dropped columns', () => {
    const r = pasteMatrix(base(), 1, 1, [['x', 'y', 'z'], ['q']]);
    expect(r.droppedColumns).toBe(2);
    expect(r.config.rows[1]).toEqual(['B', 'x']);
    expect(r.config.rows[2]).toEqual(['', 'q']);
  });
});

describe('config JSON', () => {
  it('round-trips through envelope', () => {
    const c = product();
    const text = JSON.stringify(makeEnvelope('s', 1, 'n', c));
    const r = parseEnvelope(text, 's', 1, parseImpexConfig);
    expect(r.ok && r.value.config).toEqual(c);
  });
  it('rejects invalid input without throwing', () => {
    expect(parseEnvelope('{nope', 's', 1, parseImpexConfig).ok).toBe(false);
    expect(parseEnvelope(JSON.stringify({ schema: 'other', version: 1, config: {} }), 's', 1, parseImpexConfig).ok).toBe(false);
    expect(parseEnvelope(JSON.stringify({ schema: 's', version: 9, config: {} }), 's', 1, parseImpexConfig).ok).toBe(false);
    expect(parseEnvelope(JSON.stringify({ schema: 's', version: 1, config: { mode: 'DROP', columns: [], rows: [], macros: [] } }), 's', 1, parseImpexConfig).ok).toBe(false);
    expect(parseImpexConfig({ mode: 'INSERT', columns: [], macros: [], rows: [[1]] }).ok).toBe(false);
  });
});
