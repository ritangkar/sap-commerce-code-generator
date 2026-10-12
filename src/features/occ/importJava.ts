import type { Diagnostic } from '../../shared/diagnostics';
import { HTTP_STATUS_NAMES, MEDIA_TYPE_CONSTANTS, parseJavaType } from './javaTypes';
import { defaultConfig, newEndpoint, type HttpMethod, type OccConfig, type OccEndpoint, type OccParam, HTTP_METHODS } from './model';

/**
 * Parses a deliberately small subset of Java: one controller class with Spring MVC mapping annotations.
 * It is a text scanner, not a Java compiler. Anything it cannot represent is reported, never dropped silently.
 */
export interface ImportResult {
  ok: boolean;
  config: OccConfig | null;
  findings: Diagnostic[];
}

interface Ann {
  name: string;
  args: string | null;
  raw: string;
}

/** Replace comments and string/char literal contents with spaces (newlines kept) so structure scanning is safe. */
export function maskJava(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const nx = src[i + 1];
    if (ch === '/' && nx === '/') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
    } else if (ch === '/' && nx === '*') {
      out += '  ';
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      if (i < src.length) { out += '  '; i += 2; }
    } else if (ch === '"' || ch === "'") {
      out += ch;
      i++;
      while (i < src.length && src[i] !== ch && src[i] !== '\n') {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        out += ' ';
        i++;
      }
      if (i < src.length && src[i] === ch) { out += ch; i++; }
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

function matchClose(m: string, open: number, o: string, c: string): number {
  let depth = 0;
  for (let i = open; i < m.length; i++) {
    if (m[i] === o) depth++;
    else if (m[i] === c && --depth === 0) return i;
  }
  return -1;
}

function readAnnotations(orig: string, m: string, start: number, end: number): { anns: Ann[]; next: number } {
  const anns: Ann[] = [];
  let i = start;
  for (;;) {
    while (i < end && /\s/.test(m[i])) i++;
    if (m[i] !== '@' || m.slice(i, i + 10) === '@interface') break;
    const nm = /^@([A-Za-z_][\w.]*)/.exec(m.slice(i, end));
    if (!nm) break;
    let j = i + nm[0].length;
    let k = j;
    while (k < end && /\s/.test(m[k])) k++;
    let args: string | null = null;
    if (m[k] === '(') {
      const close = matchClose(m, k, '(', ')');
      if (close < 0 || close >= end) break;
      args = orig.slice(k + 1, close);
      j = close + 1;
    }
    anns.push({ name: nm[1].split('.').pop()!, args, raw: orig.slice(i, j).replace(/\s+/g, ' ').trim() });
    i = j;
  }
  return { anns, next: i };
}

function splitTop(s: string, sep = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && s[i - 1] !== '\\') q = !q;
    if (!q) {
      if ('(<{['.includes(ch)) depth++;
      if (')>}]'.includes(ch)) depth--;
      if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** Parse annotation arguments into key -> raw value. A bare first argument is stored as `value`. */
function annArgs(args: string | null): Record<string, string> {
  const r: Record<string, string> = {};
  if (!args || !args.trim()) return r;
  splitTop(args).forEach((part, idx) => {
    const m = /^\s*([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/.exec(part);
    if (m && !part.trim().startsWith('"')) r[m[1]] = m[2].trim();
    else if (idx === 0) r.value = part.trim();
  });
  return r;
}

const strings = (v: string | undefined): string[] => (v ? [...v.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(["\\])/g, '$1')) : []);
const firstString = (v: string | undefined): string | undefined => strings(v)[0];

const MEDIA_REVERSE = Object.fromEntries(Object.entries(MEDIA_TYPE_CONSTANTS).map(([k, v]) => [v.replace('MediaType.', ''), k]));
const mediaOf = (v: string | undefined): string | null => {
  if (!v) return '';
  const s = firstString(v);
  if (s !== undefined) return s;
  const c = /MediaType\.(\w+)/.exec(v);
  return c && MEDIA_REVERSE[c[1]] ? MEDIA_REVERSE[c[1]] : null;
};

const STATUS_REVERSE = Object.fromEntries(Object.entries(HTTP_STATUS_NAMES).map(([k, v]) => [v, Number(k)]));
const MAPPING_ANN: Record<string, HttpMethod | undefined> = { GetMapping: 'GET', PostMapping: 'POST', PutMapping: 'PUT', PatchMapping: 'PATCH', DeleteMapping: 'DELETE', RequestMapping: undefined };

export function importJava(source: string): ImportResult {
  const findings: Diagnostic[] = [];
  const note = (severity: Diagnostic['severity'], code: string, message: string, hint?: string) => findings.push({ severity, code, message, hint });
  const m = maskJava(source);

  if (source.trim() === '') return { ok: false, config: null, findings: [{ severity: 'error', code: 'import.empty', message: 'No Java source provided.' }] };

  const cfg = defaultConfig();
  cfg.endpoints = [];
  cfg.extraClassAnnotations = [];
  cfg.dto.enabled = false;
  cfg.facade.enabled = false;
  cfg.validator.enabled = false;

  const pkg = /\bpackage\s+([\w.]+)\s*;/.exec(m);
  if (pkg) cfg.packageName = pkg[1];
  else note('warning', 'import.nopackage', 'No package declaration found; the package name was left at its default.');
  if (/import\s+io\.swagger\.v3\./.test(m)) cfg.profile = '2211';
  else if (/import\s+io\.swagger\.annotations\./.test(m)) cfg.profile = '2205';
  else note('info', 'import.profile', 'No Swagger imports found; the profile was left at its default. Choose 2205 or 2211 manually.');

  const classRe = /\b(?:(?:public|abstract|final|static)\s+)*(class|interface|enum)\s+([A-Za-z_]\w*)/g;
  const cm = classRe.exec(m);
  if (!cm) {
    note('error', 'import.noclass', 'No class declaration found. The source was not converted.');
    return { ok: false, config: null, findings };
  }
  if (cm[1] !== 'class') {
    note('error', 'import.notclass', `Found ${cm[1]} ${cm[2]}, but only controller classes are supported.`);
    return { ok: false, config: null, findings };
  }
  cfg.controllerName = cm[2];
  if (classRe.exec(m)) note('warning', 'import.multiclass', 'More than one type declaration was found; only the first class was read. The others are not represented.');

  const segStart = m.lastIndexOf(';', cm.index) + 1;
  const { anns: classAnns } = readAnnotations(source, m, segStart, cm.index + 1);
  let controllerSeen = false;
  for (const a of classAnns) {
    const args = annArgs(a.args);
    if (a.name === 'Controller' || a.name === 'RestController') {
      cfg.classAnnotation = a.name;
      controllerSeen = true;
    } else if (a.name === 'RequestMapping') {
      const p = firstString(args.value ?? args.path);
      if (p === undefined) note('warning', 'import.basepath', `Class-level ${a.raw} has no readable path value.`);
      else cfg.basePath = p;
      for (const k of Object.keys(args)) if (!['value', 'path'].includes(k)) note('warning', 'import.unsupported', `Class-level @RequestMapping attribute "${k}" is not represented.`);
    } else if (a.name === 'Api') {
      cfg.apiTag = firstString(args.tags ?? args.value) ?? '';
    } else if (a.name === 'Tag') {
      cfg.apiTag = firstString(args.name) ?? '';
    } else {
      cfg.extraClassAnnotations.push(a.raw);
      note('info', 'import.extraann', `Class annotation ${a.raw} was kept as an extra annotation (no import is generated for it).`);
    }
  }
  if (!controllerSeen) note('warning', 'import.nocontroller', 'The class has no @Controller or @RestController annotation.');
  const tail = m.slice(cm.index + cm[0].length, m.indexOf('{', cm.index));
  if (/\b(extends|implements)\b/.test(tail)) note('warning', 'import.supertype', `Class declaration "${tail.trim().replace(/\s+/g, ' ')}" is not represented; extends/implements clauses are not generated.`);

  const open = m.indexOf('{', cm.index);
  const close = matchClose(m, open, '{', '}');
  if (close < 0) {
    note('error', 'import.unbalanced', 'The class body has unbalanced braces. The source was not converted.');
    return { ok: false, config: null, findings };
  }

  let pos = open + 1;
  let n = 0;
  let shortcut = 0;
  while (pos < close) {
    while (pos < close && /\s/.test(m[pos])) pos++;
    if (pos >= close) break;
    const start = pos;
    let paren = 0;
    let end = -1;
    let hasBlock = false;
    let blockStart = -1;
    for (let i = pos; i < close; i++) {
      const ch = m[i];
      if (ch === '(') paren++;
      else if (ch === ')') paren--;
      else if (paren === 0 && ch === ';') { end = i; break; }
      else if (paren === 0 && ch === '{') { end = matchClose(m, i, '{', '}'); hasBlock = true; blockStart = i; break; }
    }
    if (end < 0) { note('warning', 'import.trailing', 'Trailing text in the class body could not be parsed and was skipped.'); break; }
    const headEnd = hasBlock ? blockStart : end;
    pos = end + 1;
    const { anns, next } = readAnnotations(source, m, start, headEnd);
    const rawSig = source.slice(next, headEnd);
    const maskedSig = m.slice(next, headEnd);
    const sig = rawSig.replace(/\s+/g, ' ').trim();
    const pi = maskedSig.indexOf('(');
    if (pi < 0) {
      note('info', 'import.field', `Member "${sig}${hasBlock ? ' { … }' : ''}" ${anns.map((a) => a.raw).join(' ')} is not represented by the builder (fields and injected beans are generated from the facade/validator options).`);
      continue;
    }
    // method
    const before = rawSig.slice(0, pi).replace(/\s+/g, ' ').trim();
    const nameM = /([A-Za-z_]\w*)$/.exec(before);
    if (!nameM) { note('warning', 'import.method', `Could not read method declaration "${sig}".`); continue; }
    const methodName = nameM[1];
    let ret = before.slice(0, before.length - methodName.length).trim();
    while (/^(public|private|protected|static|final|abstract|synchronized)\s+/.test(ret)) ret = ret.replace(/^\w+\s+/, '');
    const pclose = matchClose(maskedSig, pi, '(', ')');
    const paramText = rawSig.slice(pi + 1, pclose);
    const mapping = anns.find((a) => a.name in MAPPING_ANN);
    if (!mapping) {
      note('warning', 'import.nonendpoint', `Method ${methodName}() has no Spring mapping annotation and is not an endpoint; it is not represented${hasBlock ? ` (${source.slice(headEnd, end + 1).split('\n').length} body lines)` : ''}.`);
      continue;
    }
    n++;
    const e: OccEndpoint = { ...newEndpoint(n), methodName, returnType: ret || 'void', roles: [], responseCodes: [], successStatus: 200, params: [], produces: '', consumes: '', path: '' };
    if (mapping.name !== 'RequestMapping') shortcut++;
    const margs = annArgs(mapping.args);
    let hm = MAPPING_ANN[mapping.name];
    if (!hm) {
      const mv = margs.method ?? '';
      const found = [...mv.matchAll(/RequestMethod\.(\w+)/g)].map((x) => x[1]);
      if (found.length === 0) { hm = 'GET'; note('warning', 'import.method.default', `${methodName}(): @RequestMapping has no method; GET assumed (Spring would accept any method).`); }
      else {
        hm = found[0] as HttpMethod;
        if (found.length > 1) note('warning', 'import.method.multi', `${methodName}(): maps ${found.join(', ')}; only ${found[0]} was imported.`);
        if (!HTTP_METHODS.includes(hm)) { note('warning', 'import.method.unsupported', `${methodName}(): HTTP method ${hm} is not supported by the builder; GET assumed.`); hm = 'GET'; }
      }
    }
    e.httpMethod = hm;
    const pth = firstString(margs.value ?? margs.path);
    e.path = pth ?? '';
    for (const key of ['consumes', 'produces'] as const) {
      const mt = mediaOf(margs[key]);
      if (mt === null) note('warning', 'import.media', `${methodName}(): ${key} value "${margs[key]}" is not recognised and was not imported.`);
      else e[key] = mt;
    }
    for (const k of Object.keys(margs)) if (!['value', 'path', 'method', 'consumes', 'produces'].includes(k)) note('warning', 'import.unsupported', `${methodName}(): mapping attribute "${k}" is not represented.`);

    for (const a of anns) {
      const aa = annArgs(a.args);
      switch (a.name) {
        case 'RequestMapping': case 'GetMapping': case 'PostMapping': case 'PutMapping': case 'PatchMapping': case 'DeleteMapping': case 'ResponseBody': break;
        case 'Secured': e.roles = strings(a.args ?? ''); break;
        case 'ResponseStatus': {
          const st = /HttpStatus\.(\w+)/.exec(a.args ?? '');
          if (st && STATUS_REVERSE[st[1]]) e.successStatus = STATUS_REVERSE[st[1]];
          else note('warning', 'import.status', `${methodName}(): ${a.raw} is not recognised; success status left at 200.`);
          break;
        }
        case 'ApiOperation': e.summary = firstString(aa.value) ?? ''; e.description = firstString(aa.notes) ?? ''; break;
        case 'Operation': e.summary = firstString(aa.summary) ?? ''; e.description = firstString(aa.description) ?? ''; break;
        case 'ApiResponses':
          for (const r of (a.args ?? '').matchAll(/@ApiResponse\s*\(([^)]*)\)/g)) {
            const ra = annArgs(r[1]);
            const code = Number((ra.code ?? firstString(ra.responseCode) ?? '').toString());
            if (Number.isFinite(code) && code > 0) e.responseCodes.push({ code, description: firstString(ra.message ?? ra.description) ?? '' });
          }
          break;
        default:
          note('warning', 'import.method.ann', `${methodName}(): annotation ${a.raw} is not represented and will not be regenerated.`);
      }
    }
    if (e.responseCodes.length === 0) e.responseCodes = [{ code: e.successStatus, description: 'OK' }];

    for (const raw of splitTop(paramText)) {
      const mPos = maskJava(raw);
      const { anns: pa, next: pn } = readAnnotations(raw, mPos, 0, raw.length);
      const decl = raw.slice(pn).replace(/\bfinal\s+/g, '').replace(/\s+/g, ' ').trim();
      const dm = /^(.*\S)\s+([A-Za-z_]\w*)$/.exec(decl);
      if (!dm) { note('warning', 'import.param', `${methodName}(): could not read parameter "${raw.trim()}".`); continue; }
      const prm: OccParam = { kind: 'query', name: dm[2], javaName: dm[2], javaType: dm[1], required: true, defaultValue: '', description: '' };
      let kind: OccParam['kind'] | null = null;
      for (const a of pa) {
        const aa = annArgs(a.args);
        if (a.name === 'PathVariable') { kind = 'path'; prm.name = firstString(aa.value ?? aa.name) ?? dm[2]; }
        else if (a.name === 'RequestParam' || a.name === 'RequestHeader') {
          kind = a.name === 'RequestParam' ? 'query' : 'header';
          prm.name = firstString(aa.value ?? aa.name) ?? dm[2];
          if (aa.required === 'false') prm.required = false;
          if (aa.defaultValue) { prm.defaultValue = firstString(aa.defaultValue) ?? ''; prm.required = false; }
        } else if (a.name === 'RequestBody') { kind = 'body'; prm.name = ''; }
        else if (a.name === 'ApiParam') prm.description = firstString(aa.value) ?? '';
        else if (a.name === 'Parameter') prm.description = firstString(aa.description) ?? '';
        else note('warning', 'import.param.ann', `${methodName}(): parameter annotation ${a.raw} on "${dm[2]}" is not represented.`);
      }
      if (!kind) {
        if (/^(Http(Servlet)?Request|HttpServletResponse|Principal|Model|BindingResult)\b/.test(dm[1])) {
          note('warning', 'import.param.special', `${methodName}(): framework parameter "${decl}" is not represented and will not be regenerated.`);
          continue;
        }
        else note('warning', 'import.param.unbound', `${methodName}(): parameter "${decl}" has no supported binding annotation; imported as a query parameter.`);
      }
      prm.kind = kind ?? 'query';
      if (prm.kind === 'path' || prm.kind === 'body') prm.required = true;
      if (!parseJavaType(prm.javaType)) note('warning', 'import.type', `${methodName}(): type "${prm.javaType}" could not be parsed.`);
      e.params.push(prm);
    }
    if (hasBlock) {
      const lines = source.slice(headEnd, end + 1).split('\n').length;
      note('warning', 'import.body', `Method body of ${methodName}() (${lines} lines) cannot be represented; regenerating will replace it with a TODO skeleton.`, 'Your original source remains available in the Import tab.');
    }
    cfg.endpoints.push(e);
  }
  if (cfg.endpoints.length === 0) {
    note('error', 'import.noendpoints', 'No supported endpoint methods were found. The builder was not changed.');
    return { ok: false, config: null, findings };
  }
  if (shortcut > 0 && shortcut === cfg.endpoints.length) cfg.mappingStyle = 'Shortcut';
  note('info', 'import.scope', 'Imported controller structure only. DTOs, facades and validators are not imported; method bodies and fields are not preserved.');
  return { ok: true, config: cfg, findings };
}
