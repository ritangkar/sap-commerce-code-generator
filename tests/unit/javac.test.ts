import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { generateFiles } from '../../src/features/occ/generate';
import { defaultConfig, newEndpoint, type OccConfig, type OccParam } from '../../src/features/occ/model';

const hasJavac = spawnSync('javac', ['-version']).status === 0;

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const p = (kind: OccParam['kind'], name: string, javaName: string, javaType: string, over: Partial<OccParam> = {}): OccParam => ({ kind, name, javaName, javaType, required: kind === 'path' || kind === 'body', defaultValue: '', description: '', ...over });

function sink(): OccConfig {
  const c = defaultConfig();
  c.dto.fields = [
    { name: 'code', javaType: 'String', description: 'c', required: true }, { name: 'price', javaType: 'BigDecimal', description: '', required: false },
    { name: 'day', javaType: 'LocalDate', description: '', required: false }, { name: 'tags', javaType: 'List<String>', description: '', required: false },
    { name: 'active', javaType: 'Boolean', description: '', required: false }, { name: 'at', javaType: 'Instant', description: '', required: true },
  ];
  c.endpoints = [
    { ...newEndpoint(1), methodName: 'one', httpMethod: 'PUT', path: '/{id}/items/{sku}', returnType: 'ResponseEntity<String>', consumes: 'application/json', params: [
      p('path', 'id', 'id', 'Long', { description: 'id' }), p('path', 'sku', 'sku', 'String'), p('query', 'page', 'page', 'Integer', { defaultValue: '0' }), p('query', 'since', 'since', 'LocalDate'),
      p('query', 'price', 'price', 'BigDecimal'), p('query', 'ids', 'ids', 'List<String>'), p('header', 'X-Trace-Id', 'traceId', 'String', { required: false }), p('body', '', 'body', 'ProductNoteWsDTO'),
    ] },
    { ...newEndpoint(2), methodName: 'two', httpMethod: 'DELETE', path: '/{id}', returnType: 'void', successStatus: 204, params: [p('path', 'id', 'id', 'String')] },
    { ...newEndpoint(3), methodName: 'three', httpMethod: 'PATCH', path: '', returnType: 'ProductWsDTO', roles: [], summary: 'quote " and \\ backslash', description: 'line1\nline2 */ tricky', params: [p('body', '', 'dto', 'ProductNoteWsDTO')] },
  ];
  return c;
}

const variants: [string, OccConfig][] = [
  ['2205 default', { ...defaultConfig(), profile: '2205' }],
  ['2211 default', defaultConfig()],
  ['2211 shortcut + RestController', { ...defaultConfig(), mappingStyle: 'Shortcut', classAnnotation: 'RestController' }],
  ['2205 kitchen sink', { ...sink(), profile: '2205' }],
  ['2211 kitchen sink shortcut', { ...sink(), mappingStyle: 'Shortcut' }],
  ['no facade/validator/dto', { ...defaultConfig(), facade: { ...defaultConfig().facade, enabled: false }, validator: { ...defaultConfig().validator, enabled: false }, dto: { ...defaultConfig().dto, enabled: false }, endpoints: [{ ...newEndpoint(1), methodName: 'x', path: '/x' }] }],
];

describe.skipIf(!hasJavac)('generated Java compiles against minimal stubs (javac)', () => {
  it.each(variants)('%s', (_n, cfg) => {
    const out = mkdtempSync(join(tmpdir(), 'scg-java-'));
    for (const f of generateFiles(cfg)) {
      mkdirSync(dirname(join(out, f.path)), { recursive: true });
      writeFileSync(join(out, f.path), f.content);
    }
    const sources = [...walk(join(process.cwd(), 'tests/java-stubs')).filter((x) => x.endsWith('.java')), ...walk(out)];
    const classes = mkdtempSync(join(tmpdir(), 'scg-cls-'));
    try {
      execFileSync('javac', ['-proc:none', '-Xlint:none', '-d', classes, ...sources], { stdio: 'pipe' });
    } catch (e) {
      throw new Error(`javac failed:\n${(e as { stderr?: Buffer }).stderr?.toString() ?? String(e)}`);
    }
    expect(true).toBe(true);
  });
});
