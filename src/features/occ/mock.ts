import { checkDefault, parseJavaType } from './javaTypes';
import { fullPath, type KV, type OccConfig, type OccEndpoint } from './model';

export interface MockRequestInput {
  method: string;
  path: string;
  query: KV[];
  headers: KV[];
  body: string;
}

export interface MockIssue {
  severity: 'error' | 'info';
  message: string;
}

export interface MockResult {
  mock: true;
  matched: { methodName: string; pattern: string } | null;
  pathVariables: Record<string, string>;
  queryParameters: Record<string, string>;
  issues: MockIssue[];
  status: number;
  statusText: string;
  headers: KV[];
  body: string;
  /** Simulated duration = configured delay; no real timing is measured, so results are deterministic. */
  durationMs: number;
}

const STATUS_TEXT: Record<number, string> = { 200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict', 415: 'Unsupported Media Type', 500: 'Internal Server Error' };
export const statusText = (s: number) => STATUS_TEXT[s] ?? '';

const trimSlash = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/** Match a request path against a `/a/{x}/b` pattern. Returns decoded variables or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const ps = trimSlash(pattern).split('/');
  const rs = trimSlash(path).split('/');
  if (ps.length !== rs.length) return null;
  const vars: Record<string, string> = {};
  for (let i = 0; i < ps.length; i++) {
    const m = /^\{([A-Za-z_]\w*)\}$/.exec(ps[i]);
    if (m) {
      if (rs[i] === '') return null;
      try {
        vars[m[1]] = decodeURIComponent(rs[i]);
      } catch {
        vars[m[1]] = rs[i];
      }
    } else if (ps[i] !== rs[i]) return null;
  }
  return vars;
}

const errorBody = (status: number, type: string, message: string) => JSON.stringify({ errors: [{ type, message }], mock: true, status }, null, 2);

function fill(template: string, ctx: { path: Record<string, string>; query: Record<string, string>; header: Record<string, string> }): string {
  return template.replace(/\{\{\s*(path|query|header)\.([^}\s]+)\s*\}\}/g, (_m, scope: 'path' | 'query' | 'header', key: string) => {
    const bag = ctx[scope];
    return scope === 'header' ? (bag[key.toLowerCase()] ?? '') : (bag[key] ?? '');
  });
}

const typeError = (type: string, value: string): string | null => {
  const t = parseJavaType(type);
  if (!t || t.args.length || t.array) return null;
  return checkDefault(type, value);
};

export function simulate(c: OccConfig, req: MockRequestInput): MockResult {
  const issues: MockIssue[] = [];
  const base: Omit<MockResult, 'status' | 'statusText' | 'headers' | 'body'> = {
    mock: true, matched: null, pathVariables: {}, queryParameters: {}, issues, durationMs: 0,
  };
  const fail = (status: number, type: string, message: string, extraHeaders: KV[] = []): MockResult => {
    issues.push({ severity: 'error', message });
    return { ...base, status, statusText: statusText(status), headers: [{ key: 'Content-Type', value: 'application/json' }, ...extraHeaders], body: errorBody(status, type, message) };
  };

  const rawPath = req.path.trim().split(/[?#]/)[0];
  const method = req.method.toUpperCase();
  const candidates = c.endpoints
    .map((e) => ({ e, vars: matchPath(fullPath(c, e), rawPath) }))
    .filter((x): x is { e: OccEndpoint; vars: Record<string, string> } => x.vars !== null);
  if (candidates.length === 0) return fail(404, 'NotFoundError', `No configured endpoint matches path "${rawPath}".`);
  const hit = candidates.find((x) => x.e.httpMethod === method);
  if (!hit) {
    const allow = [...new Set(candidates.map((x) => x.e.httpMethod))].sort().join(', ');
    return fail(405, 'MethodNotAllowedError', `Method ${method} is not supported for "${rawPath}". Supported: ${allow}.`, [{ key: 'Allow', value: allow }]);
  }
  const { e, vars } = hit;
  base.matched = { methodName: e.methodName, pattern: `${e.httpMethod} ${fullPath(c, e)}` };
  base.pathVariables = vars;
  base.durationMs = Math.max(0, Math.round(e.mock.delayMs || 0));

  const query: Record<string, string> = {};
  for (const q of req.query) if (q.key.trim()) query[q.key.trim()] = q.value;
  const headers: Record<string, string> = {};
  for (const h of req.headers) if (h.key.trim()) headers[h.key.trim().toLowerCase()] = h.value;

  // path variables
  for (const p of e.params.filter((x) => x.kind === 'path')) {
    const err = typeError(p.javaType, vars[p.name] ?? '');
    if (err) return { ...fail(400, 'TypeMismatchError', `Path variable "${p.name}": ${err}`), ...{ matched: base.matched, pathVariables: vars, durationMs: base.durationMs } };
  }
  // query
  for (const p of e.params.filter((x) => x.kind === 'query')) {
    let v = query[p.name];
    if ((v === undefined || v === '') && p.defaultValue !== '') {
      v = p.defaultValue;
      query[p.name] = v;
      issues.push({ severity: 'info', message: `Default "${v}" applied to query parameter "${p.name}".` });
    }
    if (v === undefined) {
      if (p.required) return keep(fail(400, 'MissingServletRequestParameterError', `Required query parameter "${p.name}" is missing.`));
      continue;
    }
    const err = typeError(p.javaType, v);
    if (err) return keep(fail(400, 'TypeMismatchError', `Query parameter "${p.name}": ${err}`));
  }
  // headers
  for (const p of e.params.filter((x) => x.kind === 'header')) {
    let v = headers[p.name.toLowerCase()];
    if (v === undefined && p.defaultValue !== '') {
      v = p.defaultValue;
      headers[p.name.toLowerCase()] = v;
      issues.push({ severity: 'info', message: `Default "${v}" applied to header "${p.name}".` });
    }
    if (v === undefined) {
      if (p.required) return keep(fail(400, 'MissingRequestHeaderError', `Required header "${p.name}" is missing.`));
      continue;
    }
    const err = typeError(p.javaType, v);
    if (err) return keep(fail(400, 'TypeMismatchError', `Header "${p.name}": ${err}`));
  }
  // body
  const bp = e.params.find((x) => x.kind === 'body');
  if (bp) {
    if (req.body.trim() === '') {
      if (bp.required) return keep(fail(400, 'HttpMessageNotReadableError', 'Required request body is missing.'));
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(req.body);
      } catch (err) {
        return keep(fail(400, 'HttpMessageNotReadableError', `Malformed JSON request body: ${(err as Error).message}`));
      }
      const ct = headers['content-type'];
      if (e.consumes.trim() && ct && !ct.toLowerCase().startsWith(e.consumes.trim().toLowerCase()))
        return keep(fail(415, 'HttpMediaTypeNotSupportedError', `Content type "${ct}" is not supported; endpoint consumes ${e.consumes}.`));
      if (c.dto.enabled && parseJavaType(bp.javaType)?.name === c.dto.className) {
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
          return keep(fail(400, 'HttpMessageNotReadableError', `Request body must be a JSON object for ${c.dto.className}.`));
        const obj = parsed as Record<string, unknown>;
        const missing = c.dto.fields.filter((f) => f.required && (obj[f.name] === undefined || obj[f.name] === null)).map((f) => f.name);
        if (missing.length) return keep(fail(400, 'ValidationError', `Required field${missing.length > 1 ? 's' : ''} missing in ${c.dto.className}: ${missing.join(', ')}.`));
        const unknown = Object.keys(obj).filter((k) => !c.dto.fields.some((f) => f.name === k));
        if (unknown.length) issues.push({ severity: 'info', message: `Fields not declared on ${c.dto.className}: ${unknown.join(', ')}.` });
      }
    }
  }

  const ctx = { path: vars, query, header: headers };
  const resp = e.mock;
  return {
    ...base,
    queryParameters: query,
    status: resp.status,
    statusText: statusText(resp.status),
    headers: resp.headers.filter((h) => h.key.trim()).map((h) => ({ key: h.key, value: fill(h.value, ctx) })),
    body: fill(resp.body, ctx),
  };

  function keep(r: MockResult): MockResult {
    return { ...r, matched: base.matched, pathVariables: vars, queryParameters: query, durationMs: base.durationMs };
  }
}
