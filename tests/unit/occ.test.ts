import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { generateFiles } from '../../src/features/occ/generate';
import { validateOcc } from '../../src/features/occ/validate';
import { simulate } from '../../src/features/occ/mock';
import { importJava } from '../../src/features/occ/importJava';
import { buildProjectEntries, buildProjectZip } from '../../src/features/occ/export';
import { checkDefault, isJavaIdentifier, isPackageName, parseJavaType } from '../../src/features/occ/javaTypes';
import { defaultConfig, newEndpoint, parseOccConfig, fullPath, HTTP_METHODS, type OccConfig } from '../../src/features/occ/model';
import { crc32 } from '../../src/shared/zip';
import { makeEnvelope, parseEnvelope } from '../../src/shared/storage';

const cfg = (p: Partial<OccConfig> = {}): OccConfig => ({ ...structuredClone(defaultConfig()), ...p });
const codes = (c: OccConfig) => validateOcc(c).map((d) => d.code);
const ctrl = (c: OccConfig) => generateFiles(c)[0].content;

describe('fixtures (approved outputs)', () => {
  for (const profile of ['2205', '2211'] as const) {
    it(`matches approved files for ${profile}`, () => {
      const files = generateFiles(cfg({ profile }));
      expect(files.length).toBe(5);
      for (const f of files) {
        const p = `tests/fixtures/occ-${profile}/${f.name}`;
        if (!existsSync(p) && process.env.UPDATE_FIXTURES) {
          mkdirSync(`tests/fixtures/occ-${profile}`, { recursive: true });
          writeFileSync(p, f.content);
        }
        expect(f.content).toBe(readFileSync(p, 'utf8'));
      }
    });
  }
  it('is deterministic', () => {
    expect(generateFiles(cfg()).map((f) => f.content)).toEqual(generateFiles(structuredClone(cfg())).map((f) => f.content));
  });
  it('never emits undefined/null text', () => {
    for (const f of generateFiles(cfg())) expect(f.content).not.toMatch(/\b(undefined|null)\b/);
  });
});

describe('profiles', () => {
  it('2205 uses swagger v1, 2211 uses OpenAPI v3', () => {
    const a = ctrl(cfg({ profile: '2205' }));
    const b = ctrl(cfg({ profile: '2211' }));
    expect(a).toContain('import io.swagger.annotations.ApiOperation;');
    expect(a).toContain('@Api(tags = "Product Notes")');
    expect(a).not.toContain('io.swagger.v3');
    expect(b).toContain('import io.swagger.v3.oas.annotations.Operation;');
    expect(b).toContain('@Tag(name = "Product Notes")');
    expect(b).not.toContain('io.swagger.annotations.');
  });
  it('profile mismatch of extra annotation is diagnosed', () => {
    expect(codes(cfg({ profile: '2211', extraClassAnnotations: ['@Api(tags = "x")'] }))).toContain('ann.profile');
    expect(codes(cfg({ profile: '2205', extraClassAnnotations: ['@Tag(name = "x")'] }))).toContain('ann.profile');
  });
});

describe('mappings and bindings', () => {
  it.each(HTTP_METHODS)('generates %s mapping', (m) => {
    const c = cfg();
    c.endpoints = [{ ...newEndpoint(1), methodName: 'op', httpMethod: m, path: '/x', returnType: 'void', successStatus: 204 }];
    c.dto.enabled = c.facade.enabled = c.validator.enabled = false;
    expect(ctrl(c)).toContain(`method = RequestMethod.${m}`);
    expect(ctrl(c)).toContain('@ResponseStatus(HttpStatus.NO_CONTENT)');
  });
  it('combines base and method paths', () => {
    const c = cfg();
    expect(fullPath(c, c.endpoints[0])).toBe('/{baseSiteId}/product-notes/{noteCode}');
    expect(fullPath({ ...c, basePath: '/a/' }, { ...c.endpoints[0], path: '/b' })).toBe('/a/b');
    expect(fullPath(c, c.endpoints[1])).toBe('/{baseSiteId}/product-notes');
  });
  it('emits path/query/header/body bindings', () => {
    const c = cfg();
    c.endpoints = [{
      ...newEndpoint(1), methodName: 'op', httpMethod: 'PUT', path: '/{id}',
      params: [
        { kind: 'path', name: 'id', javaName: 'id', javaType: 'Long', required: true, defaultValue: '', description: '' },
        { kind: 'query', name: 'page', javaName: 'page', javaType: 'Integer', required: false, defaultValue: '0', description: '' },
        { kind: 'query', name: 'q', javaName: 'q', javaType: 'String', required: false, defaultValue: '', description: '' },
        { kind: 'header', name: 'X-Trace', javaName: 'trace', javaType: 'String', required: true, defaultValue: '', description: '' },
        { kind: 'body', name: '', javaName: 'body', javaType: 'ProductNoteWsDTO', required: true, defaultValue: '', description: '' },
      ],
    }];
    const src = ctrl(c);
    expect(src).toContain('@PathVariable(value = "id") final Long id');
    expect(src).toContain('@RequestParam(value = "page", defaultValue = "0") final Integer page');
    expect(src).toContain('@RequestParam(value = "q", required = false) final String q');
    expect(src).toContain('@RequestHeader(value = "X-Trace") final String trace');
    expect(src).toContain('@RequestBody final ProductNoteWsDTO body');
    expect(codes(c)).not.toContain('path.var.missing');
  });
  it('de-duplicates imports and uses fully-qualified custom types', () => {
    const c = cfg();
    c.endpoints[0].returnType = 'java.util.List<com.acme.Foo>';
    c.endpoints[1].returnType = 'List<com.acme.Foo>';
    const src = ctrl(c);
    expect(src.match(/import java\.util\.List;/g)).toHaveLength(1);
    expect(src.match(/import com\.acme\.Foo;/g)).toHaveLength(1);
  });
  it('documentation and response metadata appear', () => {
    const src = ctrl(cfg());
    expect(src).toContain('summary = "Get a product note"');
    expect(src).toContain('@ApiResponse(responseCode = "404", description = "Note not found")');
    expect(src).toContain('@Secured({ "ROLE_CLIENT", "ROLE_TRUSTED_CLIENT" })');
  });
  it('supports RestController', () => {
    const src = ctrl(cfg({ classAnnotation: 'RestController' }));
    expect(src).toContain('@RestController');
    expect(src).not.toContain('@ResponseBody');
  });
  it('optional files', () => {
    const c = cfg();
    expect(generateFiles(c).map((f) => f.name)).toEqual(['ProductNotesController.java', 'ProductNoteWsDTO.java', 'ProductNotesFacade.java', 'DefaultProductNotesFacade.java', 'ProductNotesValidator.java']);
    c.facade.enabled = c.validator.enabled = c.dto.enabled = false;
    expect(generateFiles(c)).toHaveLength(1);
    expect(ctrl(c)).toContain('throw new UnsupportedOperationException');
  });
  it('DTO and validator content', () => {
    const f = generateFiles(cfg());
    expect(f[1].content).toContain('public String getCode()');
    expect(f[1].content).toContain('@NotNull');
    expect(f[4].content).toContain('rejectIfEmptyOrWhitespace(errors, "code"');
    expect(f[4].content).toContain('ProductNoteWsDTO.class.equals(clazz)');
  });
});

describe('validation', () => {
  it('accepts valid and rejects invalid identifiers', () => {
    expect(isPackageName('com.example.occ')).toBe(true);
    expect(isPackageName('com.1bad')).toBe(false);
    expect(isPackageName('com.class')).toBe(false);
    expect(isJavaIdentifier('fooBar')).toBe(true);
    expect(isJavaIdentifier('9x')).toBe(false);
    expect(isJavaIdentifier('new')).toBe(false);
    expect(codes(cfg({ packageName: 'Bad Pkg' }))).toContain('pkg.invalid');
    expect(codes(cfg({ controllerName: '1Ctrl' }))).toContain('class.invalid');
    expect(validateOcc(cfg()).filter((d) => d.severity === 'error')).toEqual([]);
  });
  it('checks path variables both ways', () => {
    const c = cfg();
    c.endpoints[0].params = c.endpoints[0].params.filter((p) => p.kind !== 'path');
    expect(codes(c)).toContain('path.var.missing');
    const c2 = cfg();
    c2.endpoints[0].path = '/static';
    expect(codes(c2)).toContain('path.var.extra');
  });
  it('baseSiteId placeholder is only informational', () => {
    expect(codes(cfg())).toContain('path.baseSiteId');
  });
  it('diagnoses duplicate parameters, methods, mappings', () => {
    const c = cfg();
    c.endpoints[0].params.push({ ...c.endpoints[0].params[1] });
    const k = codes(c);
    expect(k).toContain('param.dup');
    expect(k).toContain('param.javaName.dup');
    const c2 = cfg();
    c2.endpoints[1].methodName = c2.endpoints[0].methodName;
    expect(codes(c2)).toContain('method.dup');
    const c3 = cfg();
    c3.endpoints[1] = { ...c3.endpoints[0], methodName: 'other', params: c3.endpoints[0].params };
    expect(codes(c3)).toContain('mapping.dup');
  });
  it('validates defaults against types', () => {
    expect(checkDefault('Integer', '12')).toBeNull();
    expect(checkDefault('Integer', '1.5')).not.toBeNull();
    expect(checkDefault('Integer', '99999999999')).not.toBeNull();
    expect(checkDefault('Boolean', 'yes')).not.toBeNull();
    expect(checkDefault('LocalDate', '2024-02-30x')).not.toBeNull();
    expect(checkDefault('String', 'anything')).toBeNull();
    const c = cfg();
    c.endpoints[0].params[1].defaultValue = 'maybe';
    expect(codes(c)).toContain('param.default');
  });
  it('flags body/GET, multiple bodies, conflicting annotations, duplicate files', () => {
    const c = cfg();
    c.endpoints[0].params.push({ kind: 'body', name: '', javaName: 'b1', javaType: 'ProductNoteWsDTO', required: true, defaultValue: '', description: '' });
    expect(codes(c)).toContain('body.method');
    c.endpoints[0].params.push({ kind: 'body', name: '', javaName: 'b2', javaType: 'ProductNoteWsDTO', required: true, defaultValue: '', description: '' });
    expect(codes(c)).toContain('body.multiple');
    expect(codes(cfg({ extraClassAnnotations: ['@RestController'] }))).toContain('ann.conflict');
    expect(codes(cfg({ extraClassAnnotations: ['not an annotation'] }))).toContain('ann.syntax');
    const d = cfg();
    d.dto.className = 'ProductNotesController';
    d.dto.packageName = d.packageName;
    expect(codes(d)).toContain('file.dup');
  });
  it('flags missing config and invalid paths', () => {
    expect(codes(cfg({ packageName: '' }))).toContain('pkg.missing');
    expect(codes(cfg({ endpoints: [] }))).toContain('endpoints.none');
    expect(codes(cfg({ basePath: 'no-slash' }))).toContain('path.slash');
    expect(codes(cfg({ basePath: '/a/{b' }))).toContain('path.braces');
  });
  it('warns about security assumptions', () => {
    const c = cfg();
    c.endpoints[0].roles = [];
    expect(codes(c)).toContain('security.none');
  });
  it('parses java types', () => {
    expect(parseJavaType('Map<String, List<Foo>>')).not.toBeNull();
    expect(parseJavaType('List<')).toBeNull();
    expect(parseJavaType('class')).toBeNull();
  });
});

describe('mock tester', () => {
  const c = cfg();
  const req = (over = {}) => ({ method: 'GET', path: '/electronics/product-notes/N-100', query: [], headers: [], body: '', ...over });
  it('matches GET and extracts path variables, substitutes templates', () => {
    const r = simulate(c, req());
    expect(r.matched?.methodName).toBe('getNote');
    expect(r.pathVariables).toEqual({ baseSiteId: 'electronics', noteCode: 'N-100' });
    expect(r.status).toBe(200);
    expect(r.body).toContain('"code": "N-100"');
    expect(r.mock).toBe(true);
  });
  it('defaults and type errors', () => {
    expect(simulate(c, req()).queryParameters).toEqual({ includeHistory: 'false' });
    const r = simulate(c, req({ query: [{ key: 'includeHistory', value: 'maybe' }] }));
    expect(r.status).toBe(400);
    expect(r.matched).not.toBeNull();
  });
  it('404 and 405', () => {
    expect(simulate(c, req({ path: '/nope' })).status).toBe(404);
    const r = simulate(c, req({ method: 'DELETE' }));
    expect(r.status).toBe(405);
    expect(r.headers.find((h) => h.key === 'Allow')?.value).toBe('GET');
  });
  it('missing required query/header', () => {
    const d = cfg();
    d.endpoints[0].params.push({ kind: 'query', name: 'must', javaName: 'must', javaType: 'String', required: true, defaultValue: '', description: '' });
    d.endpoints[0].params.push({ kind: 'header', name: 'X-Id', javaName: 'xid', javaType: 'String', required: true, defaultValue: '', description: '' });
    expect(simulate(d, req()).body).toContain('Required query parameter');
    expect(simulate(d, req({ query: [{ key: 'must', value: 'v' }] })).body).toContain('X-Id');
    expect(simulate(d, req({ query: [{ key: 'must', value: 'v' }], headers: [{ key: 'x-id', value: '1' }] })).status).toBe(200);
  });
  it('JSON bodies: valid, malformed, missing required DTO fields', () => {
    const post = { method: 'POST', path: '/electronics/product-notes' };
    expect(simulate(c, req({ ...post, body: '{"code":"a","text":"b"}' })).status).toBe(201);
    const bad = simulate(c, req({ ...post, body: '{"code":' }));
    expect(bad.status).toBe(400);
    expect(bad.body).toContain('Malformed JSON');
    const miss = simulate(c, req({ ...post, body: '{"code":"a"}' }));
    expect(miss.status).toBe(400);
    expect(miss.body).toContain('text');
    expect(simulate(c, req({ ...post, body: '' })).status).toBe(400);
  });
  it('is deterministic, reports configured delay as duration', () => {
    const d = cfg();
    d.endpoints[0].mock.delayMs = 250;
    d.endpoints[0].mock.status = 418;
    d.endpoints[0].mock.headers = [{ key: 'X-A', value: '{{path.noteCode}}' }];
    const a = simulate(d, req());
    expect(JSON.stringify(a)).toBe(JSON.stringify(simulate(d, req())));
    expect(a.durationMs).toBe(250);
    expect(a.status).toBe(418);
    expect(a.headers).toEqual([{ key: 'X-A', value: 'N-100' }]);
  });
});

describe('java import', () => {
  const src = readFileSync('tests/fixtures/ImportMe.java', 'utf8');
  it('imports supported syntax', () => {
    const r = importJava(src);
    expect(r.ok).toBe(true);
    const c = r.config!;
    expect(c.packageName).toBe('com.acme.occ');
    expect(c.controllerName).toBe('OrderNotesController');
    expect(c.basePath).toBe('/{baseSiteId}/order-notes');
    expect(c.profile).toBe('2205');
    expect(c.endpoints.map((e) => [e.methodName, e.httpMethod, e.path])).toEqual([['list', 'GET', '/{orderCode}'], ['add', 'POST', '']]);
    expect(c.endpoints[0].params.map((p) => [p.kind, p.name, p.javaType, p.required, p.defaultValue])).toEqual([
      ['path', 'orderCode', 'String', true, ''], ['query', 'limit', 'Integer', false, '10'],
    ]);
    expect(c.endpoints[0].roles).toEqual(['ROLE_CLIENT']);
    expect(c.endpoints[1].successStatus).toBe(201);
    expect(c.endpoints[1].params[0].kind).toBe('body');
    expect(c.endpoints[0].summary).toBe('List notes');
  });
  it('reports unsupported constructs instead of dropping them silently', () => {
    const f = importJava(src).findings.map((x) => x.code);
    expect(f).toContain('import.body');
    expect(f).toContain('import.field');
    expect(f).toContain('import.nonendpoint');
    expect(f).toContain('import.extraann');
    expect(f).toContain('import.param.special');
  });
  it('fails clearly on malformed or empty input', () => {
    expect(importJava('').ok).toBe(false);
    expect(importJava('public class {').ok).toBe(false);
    const r = importJava('public class X { void a() {} }');
    expect(r.ok).toBe(false);
    expect(r.findings.some((x) => x.severity === 'error')).toBe(true);
    expect(importJava('public interface Foo {}').ok).toBe(false);
  });
  it('round-trips imported config through the generator', () => {
    const c = importJava(src).config!;
    const out = ctrl(c);
    expect(out).toContain('public class OrderNotesController');
    expect(out).toContain('@RequestMapping(value = "/{orderCode}", method = RequestMethod.GET');
  });
});

describe('export', () => {
  it('ZIP contains files and README with deterministic bytes', () => {
    const c = cfg();
    const d = validateOcc(c);
    const entries = buildProjectEntries(c, d);
    expect(entries.map((e) => e.path)).toContain('README.md');
    expect(entries.map((e) => e.path)).toContain('src/com/example/occ/controllers/ProductNotesController.java');
    const readme = entries.find((e) => e.path === 'README.md')!.content;
    expect(readme).toContain('SAP Commerce 2211');
    expect(readme).toContain('Validation limitations');
    const z1 = buildProjectZip(c, d);
    const z2 = buildProjectZip(c, d);
    expect(Buffer.from(z1).equals(Buffer.from(z2))).toBe(true);
    // structural checks: local header signature, end-of-central-directory, entry count
    expect(Buffer.from(z1).readUInt32LE(0)).toBe(0x04034b50);
    expect(Buffer.from(z1).readUInt16LE(z1.length - 22 + 10)).toBe(entries.length);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('config JSON round-trips; invalid input rejected', () => {
    const c = cfg();
    const text = JSON.stringify(makeEnvelope('s', 1, 'n', c));
    const r = parseEnvelope(text, 's', 1, parseOccConfig);
    expect(r.ok && r.value.config).toEqual(c);
    expect(parseEnvelope('[]', 's', 1, parseOccConfig).ok).toBe(false);
    expect(parseOccConfig({ profile: '1905', endpoints: [] }).ok).toBe(false);
    expect(parseOccConfig({ profile: '2205', endpoints: [{ httpMethod: 'TRACE' }] }).ok).toBe(false);
  });
});
