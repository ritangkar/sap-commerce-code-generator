import type { StorageResult } from '../../shared/storage';

export const PROFILES = ['2205', '2211'] as const;
export type Profile = (typeof PROFILES)[number];
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];
export type ParamKind = 'path' | 'query' | 'header' | 'body';
export type ClassAnnotation = 'Controller' | 'RestController';
/** `RequestMapping` emits @RequestMapping(method = …); `Shortcut` emits @GetMapping/@PostMapping/… */
export type MappingStyle = 'RequestMapping' | 'Shortcut';

export interface KV {
  key: string;
  value: string;
}

export interface OccParam {
  kind: ParamKind;
  /** External name (path placeholder, query/header name). Ignored for body. */
  name: string;
  javaName: string;
  javaType: string;
  required: boolean;
  defaultValue: string;
  description: string;
}

export interface ResponseCode {
  code: number;
  description: string;
}

export interface MockResponse {
  status: number;
  headers: KV[];
  body: string;
  delayMs: number;
}

export interface OccEndpoint {
  methodName: string;
  httpMethod: HttpMethod;
  /** Path relative to the controller base path. May be empty. */
  path: string;
  consumes: string;
  produces: string;
  summary: string;
  description: string;
  successStatus: number;
  responseCodes: ResponseCode[];
  returnType: string;
  roles: string[];
  params: OccParam[];
  mock: MockResponse;
}

export interface DtoField {
  name: string;
  javaType: string;
  description: string;
  required: boolean;
}

export interface DtoConfig {
  enabled: boolean;
  packageName: string;
  className: string;
  description: string;
  fields: DtoField[];
}

export interface MockRequest {
  method: HttpMethod;
  path: string;
  query: KV[];
  headers: KV[];
  body: string;
}

export interface OccConfig {
  profile: Profile;
  packageName: string;
  controllerName: string;
  basePath: string;
  classAnnotation: ClassAnnotation;
  mappingStyle: MappingStyle;
  apiTag: string;
  /** Raw extra class-level annotations, one per entry, e.g. `@Deprecated`. */
  extraClassAnnotations: string[];
  endpoints: OccEndpoint[];
  dto: DtoConfig;
  facade: { enabled: boolean; packageName: string; interfaceName: string; implName: string };
  validator: { enabled: boolean; packageName: string; className: string };
  mockRequest: MockRequest;
}

export const OCC_SCHEMA = 'sap-commerce-code-generator/occ-config';
export const OCC_VERSION = 1;

export const newParam = (kind: ParamKind = 'query'): OccParam => ({
  kind, name: '', javaName: '', javaType: kind === 'body' ? 'Object' : 'String', required: kind === 'path' || kind === 'body', defaultValue: '', description: '',
});

export const newEndpoint = (n = 1): OccEndpoint => ({
  methodName: `endpoint${n}`, httpMethod: 'GET', path: '', consumes: '', produces: 'application/json', summary: '', description: '',
  successStatus: 200, responseCodes: [{ code: 200, description: 'OK' }], returnType: 'String', roles: ['ROLE_CLIENT', 'ROLE_TRUSTED_CLIENT'], params: [],
  mock: { status: 200, headers: [{ key: 'Content-Type', value: 'application/json' }], body: '{}', delayMs: 0 },
});

export const baseName = (controllerName: string): string => controllerName.replace(/Controller$/, '') || controllerName;

export const defaultConfig = (): OccConfig => ({
  profile: '2211',
  packageName: 'com.example.occ.controllers',
  controllerName: 'ProductNotesController',
  basePath: '/{baseSiteId}/product-notes',
  classAnnotation: 'Controller',
  mappingStyle: 'RequestMapping',
  apiTag: 'Product Notes',
  extraClassAnnotations: [],
  endpoints: [
    {
      ...newEndpoint(1),
      methodName: 'getNote', httpMethod: 'GET', path: '/{noteCode}', summary: 'Get a product note', description: 'Returns a single product note by its code.',
      returnType: 'ProductNoteWsDTO', responseCodes: [{ code: 200, description: 'Note found' }, { code: 404, description: 'Note not found' }],
      params: [
        { kind: 'path', name: 'noteCode', javaName: 'noteCode', javaType: 'String', required: true, defaultValue: '', description: 'Code of the note' },
        { kind: 'query', name: 'includeHistory', javaName: 'includeHistory', javaType: 'Boolean', required: false, defaultValue: 'false', description: 'Include edit history' },
      ],
      mock: { status: 200, headers: [{ key: 'Content-Type', value: 'application/json' }], body: '{ "code": "{{path.noteCode}}", "text": "Sample note" }', delayMs: 0 },
    },
    {
      ...newEndpoint(2),
      methodName: 'createNote', httpMethod: 'POST', path: '', consumes: 'application/json', summary: 'Create a product note', description: '',
      successStatus: 201, returnType: 'ProductNoteWsDTO', responseCodes: [{ code: 201, description: 'Created' }, { code: 400, description: 'Validation error' }],
      params: [{ kind: 'body', name: '', javaName: 'note', javaType: 'ProductNoteWsDTO', required: true, defaultValue: '', description: 'Note to create' }],
      mock: { status: 201, headers: [{ key: 'Content-Type', value: 'application/json' }], body: '{ "code": "N-1" }', delayMs: 0 },
    },
  ],
  dto: {
    enabled: true, packageName: 'com.example.occ.dto', className: 'ProductNoteWsDTO', description: 'A note attached to a product',
    fields: [
      { name: 'code', javaType: 'String', description: 'Unique note code', required: true },
      { name: 'text', javaType: 'String', description: 'Note text', required: true },
      { name: 'priority', javaType: 'Integer', description: 'Priority', required: false },
    ],
  },
  facade: { enabled: true, packageName: 'com.example.occ.facades', interfaceName: 'ProductNotesFacade', implName: 'DefaultProductNotesFacade' },
  validator: { enabled: true, packageName: 'com.example.occ.validators', className: 'ProductNotesValidator' },
  mockRequest: { method: 'GET', path: '/electronics/product-notes/N-100', query: [{ key: 'includeHistory', value: 'true' }], headers: [], body: '' },
});

// ---- untrusted JSON -> normalised config ----
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const s = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const b = (v: unknown, d = false): boolean => (typeof v === 'boolean' ? v : d);
const n = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const kvs = (v: unknown): KV[] => arr(v).filter(isObj).map((x) => ({ key: s(x.key), value: s(x.value) }));

export function parseOccConfig(input: unknown): StorageResult<OccConfig> {
  if (!isObj(input)) return { ok: false, error: 'Configuration must be an object.' };
  if (!PROFILES.includes(input.profile as Profile)) return { ok: false, error: `Unsupported profile: ${String(input.profile)}.` };
  if (!Array.isArray(input.endpoints)) return { ok: false, error: 'Configuration must contain an "endpoints" array.' };
  const endpoints: OccEndpoint[] = [];
  for (const [i, e] of input.endpoints.entries()) {
    if (!isObj(e)) return { ok: false, error: `endpoints[${i}] must be an object.` };
    if (!HTTP_METHODS.includes(e.httpMethod as HttpMethod)) return { ok: false, error: `endpoints[${i}]: unsupported HTTP method ${String(e.httpMethod)}.` };
    const mock = isObj(e.mock) ? e.mock : {};
    endpoints.push({
      methodName: s(e.methodName), httpMethod: e.httpMethod as HttpMethod, path: s(e.path), consumes: s(e.consumes), produces: s(e.produces),
      summary: s(e.summary), description: s(e.description), successStatus: n(e.successStatus, 200),
      responseCodes: arr(e.responseCodes).filter(isObj).map((r) => ({ code: n(r.code), description: s(r.description) })),
      returnType: s(e.returnType, 'void'), roles: arr(e.roles).filter((r): r is string => typeof r === 'string'),
      params: arr(e.params).filter(isObj).map((p) => ({
        kind: (['path', 'query', 'header', 'body'].includes(p.kind as string) ? p.kind : 'query') as ParamKind,
        name: s(p.name), javaName: s(p.javaName), javaType: s(p.javaType, 'String'), required: b(p.required), defaultValue: s(p.defaultValue), description: s(p.description),
      })),
      mock: { status: n(mock.status, 200), headers: kvs(mock.headers), body: s(mock.body), delayMs: n(mock.delayMs) },
    });
  }
  const dto = isObj(input.dto) ? input.dto : {};
  const facade = isObj(input.facade) ? input.facade : {};
  const validator = isObj(input.validator) ? input.validator : {};
  const mr = isObj(input.mockRequest) ? input.mockRequest : {};
  return {
    ok: true,
    value: {
      profile: input.profile as Profile, packageName: s(input.packageName), controllerName: s(input.controllerName), basePath: s(input.basePath),
      classAnnotation: input.classAnnotation === 'RestController' ? 'RestController' : 'Controller', mappingStyle: input.mappingStyle === 'Shortcut' ? 'Shortcut' : 'RequestMapping', apiTag: s(input.apiTag),
      extraClassAnnotations: arr(input.extraClassAnnotations).filter((x): x is string => typeof x === 'string'),
      endpoints,
      dto: {
        enabled: b(dto.enabled), packageName: s(dto.packageName), className: s(dto.className), description: s(dto.description),
        fields: arr(dto.fields).filter(isObj).map((f) => ({ name: s(f.name), javaType: s(f.javaType, 'String'), description: s(f.description), required: b(f.required) })),
      },
      facade: { enabled: b(facade.enabled), packageName: s(facade.packageName), interfaceName: s(facade.interfaceName), implName: s(facade.implName) },
      validator: { enabled: b(validator.enabled), packageName: s(validator.packageName), className: s(validator.className) },
      mockRequest: {
        method: HTTP_METHODS.includes(mr.method as HttpMethod) ? (mr.method as HttpMethod) : 'GET', path: s(mr.path), query: kvs(mr.query), headers: kvs(mr.headers), body: s(mr.body),
      },
    },
  };
}

/** Normalise one path segment group: trim, single leading slash, no duplicate or trailing slashes. Empty stays empty. */
export function normSegment(p: string): string {
  const t = p.trim().replace(/\/{2,}/g, '/');
  if (t === '' || t === '/') return '';
  return (t.startsWith('/') ? t : `/${t}`).replace(/\/$/, '');
}

/** Full request path pattern of an endpoint: base + method path joined with exactly one slash. */
export function fullPath(c: OccConfig, e: OccEndpoint): string {
  return `${normSegment(c.basePath)}${normSegment(e.path)}` || '/';
}
