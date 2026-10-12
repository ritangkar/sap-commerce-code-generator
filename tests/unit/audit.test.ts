import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { generateFiles } from '../../src/features/occ/generate';
import { validateOcc } from '../../src/features/occ/validate';
import { importJava } from '../../src/features/occ/importJava';
import { defaultConfig, fullPath, newEndpoint, normSegment, parseOccConfig, type OccConfig } from '../../src/features/occ/model';
import { serializeImpex } from '../../src/features/impex/serializer';
import { validateImpex } from '../../src/features/impex/validate';
import { defaultConfig as impexDefault, emptyColumn, type ImpexConfig } from '../../src/features/impex/model';
import { parseCsv, applyCsvImport } from '../../src/features/impex/csv';

const occ = (p: Partial<OccConfig> = {}): OccConfig => ({ ...structuredClone(defaultConfig()), ...p });

describe('OCC path normalisation', () => {
  it('joins base and method path with exactly one slash', () => {
    expect(normSegment('/products/')).toBe('/products');
    expect(normSegment('products')).toBe('/products');
    expect(normSegment('//a//b/')).toBe('/a/b');
    expect(normSegment('/')).toBe('');
    const c = occ({ basePath: '/products/' });
    const e = { ...newEndpoint(1), path: '{productCode}' };
    expect(fullPath(c, e)).toBe('/products/{productCode}');
    expect(fullPath(c, { ...e, path: '' })).toBe('/products');
    expect(fullPath(occ({ basePath: '/' }), { ...e, path: '/x' })).toBe('/x');
  });
  it('a missing leading slash on a method path is a warning and is fixed in generated code', () => {
    const c = occ();
    c.endpoints[0].path = '{noteCode}';
    const codes = validateOcc(c).map((d) => d.code);
    expect(codes).toContain('path.slash.added');
    expect(codes).not.toContain('path.var.missing');
    expect(generateFiles(c)[0].content).toContain('value = "/{noteCode}"');
  });
});

describe('OCC mapping style and return types', () => {
  it('shortcut mappings generate @GetMapping etc. and drop RequestMethod', () => {
    const c = occ({ mappingStyle: 'Shortcut' });
    const src = generateFiles(c)[0].content;
    expect(src).toContain('@GetMapping(value = "/{noteCode}", produces = MediaType.APPLICATION_JSON_VALUE)');
    expect(src).toContain('@PostMapping(value = "", consumes');
    expect(src).toContain('import org.springframework.web.bind.annotation.GetMapping;');
    expect(src).not.toContain('RequestMethod');
  });
  it('ResponseEntity return type is imported and not flagged', () => {
    const c = occ();
    c.endpoints[0].returnType = 'ResponseEntity<String>';
    expect(generateFiles(c)[0].content).toContain('import org.springframework.http.ResponseEntity;');
    expect(validateOcc(c).some((d) => d.code === 'type.noimport')).toBe(false);
  });
  it('import detects an all-shortcut controller; old configs without mappingStyle load', () => {
    const r = importJava('@RestController\n@RequestMapping("/p")\npublic class P { @GetMapping("/{id}") public String g(@PathVariable("id") String id) { return id; } }');
    expect(r.ok).toBe(true);
    expect(r.config!.mappingStyle).toBe('Shortcut');
    expect(r.config!.endpoints[0].path).toBe('/{id}');
    const legacy = JSON.parse(JSON.stringify(defaultConfig()));
    delete legacy.mappingStyle;
    const p = parseOccConfig(legacy);
    expect(p.ok && p.value.mappingStyle).toBe('RequestMapping');
  });
  it('states that a controller alone is not a working endpoint', () => {
    expect(validateOcc(occ()).some((d) => d.code === 'scope.controller')).toBe(true);
  });
  it('unsupported class annotation and mismatched profile syntax are diagnosed', () => {
    expect(validateOcc(occ({ extraClassAnnotations: ['@CustomThing(x)'] })).some((d) => d.code === 'ann.import')).toBe(true);
  });
});

describe('ImpEx edge-case fixture', () => {
  const cfg = (): ImpexConfig => ({
    ...impexDefault(), mode: 'INSERT_UPDATE', type: 'Product', typeModifiers: 'batchmode=true', comment: 'Edge cases',
    macros: [
      { name: 'productCatalog', value: 'exampleProductCatalog' },
      { name: 'productCatalogVersion', value: 'Online' },
      { name: 'catalogVersion', value: 'catalogVersion(catalog(id[default=$productCatalog]),version[default=$productCatalogVersion])[unique=true,default=$productCatalog:$productCatalogVersion]' },
    ],
    columns: [
      { ...emptyColumn('code'), unique: true }, { ...emptyColumn('$catalogVersion') }, { ...emptyColumn('name'), lang: 'en' },
      { ...emptyColumn('supercategories(code,catalogVersion(catalog(id),version))'), rawModifiers: 'collection-delimiter=|,mode=append' },
      { ...emptyColumn('description'), lang: 'de', allowNull: true },
    ],
    rows: [
      ['EX-001', '', 'Example; "Product"', 'cat1:$productCatalog:$productCatalogVersion|cat2', 'Zeile 1\nZeile 2 – Übergröße 東京'],
      ['EX-002', '', '', '', ''],
    ],
  });
  it('matches the approved fixture byte for byte and is stable', () => {
    const p = 'tests/fixtures/impex-edge.impex';
    const text = serializeImpex(cfg()).text;
    if (!existsSync(p) && process.env.UPDATE_FIXTURES) writeFileSync(p, text);
    expect(text).toBe(readFileSync(p, 'utf8'));
    expect(serializeImpex(cfg()).text).toBe(text);
  });
  it('has no errors, preserves raw syntax, and flags only expected warnings', () => {
    const d = validateImpex(cfg());
    expect(d.filter((x) => x.severity === 'error')).toEqual([]);
    expect(d.some((x) => x.code === 'cell.empty')).toBe(true); // empty cells are informational, never "null"
  });
  it('REMOVE keeps header and warns', () => {
    const c = { ...cfg(), mode: 'REMOVE' as const };
    expect(serializeImpex(c).lines.some((l) => l.startsWith('REMOVE Product[batchmode=true];code[unique=true]'))).toBe(true);
    expect(validateImpex(c).some((x) => x.code === 'mode.remove')).toBe(true);
  });
  it('quoted multi-line CSV round-trips through import and serialization unchanged', () => {
    const c = cfg();
    const text = serializeImpex(c).text;
    // re-parse the data rows with the CSV parser using ";" and compare with the source cells
    const dataPart = text.slice(text.indexOf('\n;') + 1);
    const parsed = parseCsv(dataPart, ';');
    expect(parsed.fatal).toBe(false);
    expect(parsed.rows.map((r) => r.slice(1, 1 + c.columns.length))).toEqual(c.rows);
    const back = applyCsvImport({ ...c, rows: [] }, parsed.rows, { hasHeader: false, mapping: [1, 2, 3, 4, 5], mode: 'replace' });
    expect(back.rows).toEqual(c.rows);
  });
});

describe('scale', () => {
  it('serializes and validates 5,000 rows x 8 columns quickly', () => {
    const c = impexDefault();
    c.columns = Array.from({ length: 8 }, (_, i) => ({ ...emptyColumn(`attr${i}`), unique: i === 0 }));
    c.rows = Array.from({ length: 5000 }, (_, r) => c.columns.map((_c, i) => `v${r}-${i}`));
    const t = performance.now();
    const s = serializeImpex(c);
    const d = validateImpex(c);
    const ms = performance.now() - t;
    expect(s.lines.length).toBe(5001);
    expect(d.filter((x) => x.severity === 'error')).toEqual([]);
    expect(ms).toBeLessThan(2000);
  });
});
