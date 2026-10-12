import type { Diagnostic } from '../../shared/diagnostics';
import { checkDefault, isJavaIdentifier, isPackageName, parseJavaType, SCALAR_TYPES, KNOWN_TYPES, JAVA_LANG } from './javaTypes';
import { fullPath, HTTP_METHODS, type OccConfig, type OccEndpoint } from './model';
import { pathOf, plannedClasses } from './generate';

const PLACEHOLDER = /\{([^{}]*)\}/g;
export const placeholders = (path: string): string[] => [...path.matchAll(PLACEHOLDER)].map((m) => m[1]);

/** Annotations the generator emits itself or that belong to the other Swagger generation. */
const OWN_ANNOTATIONS = new Set(['Controller', 'RestController', 'RequestMapping']);
const V1 = new Set(['Api', 'ApiOperation', 'ApiParam', 'ApiModel', 'ApiModelProperty', 'ApiResponses']);
const V3 = new Set(['Tag', 'Operation', 'Parameter', 'Schema']);

function checkPath(d: Diagnostic[], path: string, label: string, p: string, opts: { allowEmpty: boolean }) {
  if (path === '') {
    if (!opts.allowEmpty) d.push({ severity: 'error', code: 'path.empty', message: `${label} is required.`, path: p });
    return;
  }
  if (!path.startsWith('/')) d.push({ severity: 'error', code: 'path.slash', message: `${label} "${path}" must start with "/".`, path: p });
  if (/\s/.test(path)) d.push({ severity: 'error', code: 'path.space', message: `${label} "${path}" must not contain whitespace.`, path: p });
  if (/\/\//.test(path)) d.push({ severity: 'warning', code: 'path.doubleslash', message: `${label} "${path}" contains "//".`, path: p });
  if (/[?#]/.test(path)) d.push({ severity: 'error', code: 'path.query', message: `${label} "${path}" must not contain "?" or "#"; declare query parameters separately.`, path: p });
  const stripped = path.replace(PLACEHOLDER, '');
  if (/[{}]/.test(stripped)) d.push({ severity: 'error', code: 'path.braces', message: `${label} "${path}" has unbalanced braces.`, path: p });
  for (const name of placeholders(path))
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) d.push({ severity: 'error', code: 'path.placeholder', message: `Placeholder {${name}} in ${label} is not a valid name.`, path: p });
}

function validateEndpoint(c: OccConfig, e: OccEndpoint, i: number, d: Diagnostic[]) {
  const p = `endpoints[${i}]`;
  const label = e.methodName || `endpoint ${i + 1}`;
  if (!e.methodName) d.push({ severity: 'error', code: 'method.missing', message: `Endpoint ${i + 1}: method name is required.`, path: p });
  else if (!isJavaIdentifier(e.methodName)) d.push({ severity: 'error', code: 'method.invalid', message: `"${e.methodName}" is not a valid Java method name.`, path: p });
  else if (/^[A-Z]/.test(e.methodName)) d.push({ severity: 'warning', code: 'method.case', message: `Method "${e.methodName}" should start with a lowercase letter.`, path: p });
  checkPath(d, e.path, `Endpoint path of ${label}`, `${p}.path`, { allowEmpty: true });

  if (!HTTP_METHODS.includes(e.httpMethod)) d.push({ severity: 'error', code: 'http.unsupported', message: `Unsupported HTTP method ${e.httpMethod}.`, path: p });

  // types
  const rt = e.returnType.trim();
  if (!rt) d.push({ severity: 'error', code: 'return.missing', message: `${label}: return type is required (use void for none).`, path: p });
  else if (!parseJavaType(rt)) d.push({ severity: 'error', code: 'return.invalid', message: `${label}: return type "${rt}" is not valid Java type syntax.`, path: p });
  if (rt === 'void' && e.successStatus === 200) d.push({ severity: 'info', code: 'return.void200', message: `${label}: void method with status 200; consider 204 No Content.`, path: p });

  // consumes/produces
  if (e.consumes.trim() && (e.httpMethod === 'GET' || e.httpMethod === 'DELETE'))
    d.push({ severity: 'warning', code: 'consumes.nobody', message: `${label}: "consumes" is set on a ${e.httpMethod} endpoint, which normally has no request body.`, path: p });
  for (const [k, v] of [['consumes', e.consumes], ['produces', e.produces]] as const)
    if (v.trim() && !/^[\w.+-]+\/[\w.+*-]+$/.test(v.trim())) d.push({ severity: 'error', code: 'media.invalid', message: `${label}: ${k} "${v}" is not a valid media type.`, path: p });

  // response codes
  const seen = new Set<number>();
  for (const r of e.responseCodes) {
    if (!Number.isInteger(r.code) || r.code < 100 || r.code > 599) d.push({ severity: 'error', code: 'status.invalid', message: `${label}: response code ${r.code} is out of range 100–599.`, path: p });
    if (seen.has(r.code)) d.push({ severity: 'error', code: 'status.duplicate', message: `${label}: response code ${r.code} listed twice.`, path: p });
    seen.add(r.code);
  }
  if (!Number.isInteger(e.successStatus) || e.successStatus < 200 || e.successStatus > 299)
    d.push({ severity: 'warning', code: 'status.success', message: `${label}: success status ${e.successStatus} is not a 2xx code.`, path: p });
  if (e.successStatus === 204 && rt !== 'void') d.push({ severity: 'warning', code: 'status.204body', message: `${label}: 204 No Content with a non-void return type; the body will not be sent.`, path: p });
  if (e.responseCodes.length && !seen.has(e.successStatus)) d.push({ severity: 'info', code: 'status.undocumented', message: `${label}: success status ${e.successStatus} is not in the documented response codes.`, path: p });

  // security
  if (e.roles.length === 0) d.push({ severity: 'warning', code: 'security.none', message: `${label}: no @Secured roles; access then depends entirely on your project's security configuration.`, path: p });
  for (const r of e.roles) if (!/^ROLE_[A-Z0-9_]+$/.test(r)) d.push({ severity: 'warning', code: 'security.role', message: `${label}: role "${r}" does not follow the ROLE_UPPER_CASE convention.`, path: p });
  if (e.roles.length && e.roles.includes('ROLE_ANONYMOUS')) d.push({ severity: 'info', code: 'security.anonymous', message: `${label}: ROLE_ANONYMOUS allows unauthenticated access if your security config permits it.`, path: p });

  // params
  const javaNames = new Set<string>();
  const ext = new Set<string>();
  let bodies = 0;
  const pathVars = new Set<string>();
  e.params.forEach((q, k) => {
    const pp = `${p}.params[${k}]`;
    const pl = q.javaName || `parameter ${k + 1}`;
    if (!isJavaIdentifier(q.javaName)) d.push({ severity: 'error', code: 'param.javaName', message: `${label}: "${q.javaName}" is not a valid Java parameter name.`, path: pp });
    else if (javaNames.has(q.javaName)) d.push({ severity: 'error', code: 'param.javaName.dup', message: `${label}: duplicate Java parameter name "${q.javaName}".`, path: pp });
    javaNames.add(q.javaName);
    const pt = parseJavaType(q.javaType);
    if (!pt) d.push({ severity: 'error', code: 'param.type', message: `${label}: type "${q.javaType}" of ${pl} is not valid Java type syntax.`, path: pp });
    if (q.kind !== 'body') {
      if (!q.name.trim()) d.push({ severity: 'error', code: 'param.name', message: `${label}: ${pl} needs an external name.`, path: pp });
      const key = `${q.kind}:${q.kind === 'header' ? q.name.toLowerCase() : q.name}`;
      if (q.name.trim() && ext.has(key)) d.push({ severity: 'error', code: 'param.dup', message: `${label}: duplicate ${q.kind} parameter "${q.name}".`, path: pp });
      ext.add(key);
      if (pt && !pt.array && !SCALAR_TYPES.has(pt.name.split('.').pop()!) && !pt.args.length && !JAVA_LANG.has(pt.name))
        d.push({ severity: 'info', code: 'param.custom', message: `${label}: ${q.kind} parameter "${q.name}" uses type ${q.javaType}; Spring needs a converter or enum for non-scalar types.`, path: pp });
      if (pt && pt.args.length && pt.name !== 'List' && pt.name !== 'Set' && pt.name !== 'Collection')
        d.push({ severity: 'warning', code: 'param.generic', message: `${label}: generic type ${q.javaType} is unusual for a ${q.kind} parameter.`, path: pp });
    }
    if (q.kind === 'path') {
      pathVars.add(q.name);
      if (!q.required) d.push({ severity: 'warning', code: 'param.path.optional', message: `${label}: path variable "${q.name}" is always required; "required" is ignored.`, path: pp });
      if (q.defaultValue !== '') d.push({ severity: 'error', code: 'param.path.default', message: `${label}: path variable "${q.name}" cannot have a default value.`, path: pp });
    }
    if (q.kind === 'body') {
      bodies++;
      if (e.httpMethod === 'GET' || e.httpMethod === 'DELETE') d.push({ severity: 'warning', code: 'body.method', message: `${label}: ${e.httpMethod} with @RequestBody is non-standard and often unsupported by clients and proxies.`, path: pp });
      if (q.defaultValue !== '') d.push({ severity: 'error', code: 'param.body.default', message: `${label}: a request body cannot have a default value.`, path: pp });
      if (pt && SCALAR_TYPES.has(pt.name)) d.push({ severity: 'warning', code: 'body.scalar', message: `${label}: request body type ${q.javaType} is a scalar; a DTO is usual.`, path: pp });
    }
    if (q.defaultValue !== '' && q.kind !== 'path' && q.kind !== 'body') {
      const err = checkDefault(q.javaType, q.defaultValue);
      if (err) d.push({ severity: 'error', code: 'param.default', message: `${label}: default of "${q.name}": ${err}`, path: pp });
      if (q.required) d.push({ severity: 'info', code: 'param.default.required', message: `${label}: "${q.name}" has a default, so Spring treats it as optional even though required is set.`, path: pp });
    }
  });
  if (bodies > 1) d.push({ severity: 'error', code: 'body.multiple', message: `${label}: only one @RequestBody parameter is allowed.`, path: p });
  if (bodies === 1 && !e.consumes.trim() && e.httpMethod !== 'GET' && e.httpMethod !== 'DELETE')
    d.push({ severity: 'info', code: 'body.consumes', message: `${label}: no "consumes" media type set; Spring will accept any content type it can convert.`, path: p });

  // path variable consistency
  const full = fullPath(c, e);
  for (const ph of placeholders(full)) {
    if (!pathVars.has(ph)) {
      if (ph === 'baseSiteId') d.push({ severity: 'info', code: 'path.baseSiteId', message: `${label}: {baseSiteId} has no @PathVariable; OCC normally resolves it in filters. Verify for your setup.`, path: p });
      else d.push({ severity: 'error', code: 'path.var.missing', message: `${label}: path placeholder {${ph}} has no matching path variable.`, hint: `Add a path parameter named "${ph}".`, path: p });
    }
  }
  for (const v of pathVars) if (v && !placeholders(full).includes(v)) d.push({ severity: 'error', code: 'path.var.extra', message: `${label}: path variable "${v}" does not appear as a placeholder in "${full}".`, path: p });
}

export function validateOcc(c: OccConfig): Diagnostic[] {
  const d: Diagnostic[] = [];
  // profile notes
  if (c.profile === '2205')
    d.push({ severity: 'info', code: 'profile.2205', message: 'Profile 2205: Swagger v1 annotations (io.swagger.annotations) are generated.', hint: 'Assumes javax.* namespaces. The package of @WebserviceValidationException and swagger setup must be verified in your project.' });
  else
    d.push({ severity: 'info', code: 'profile.2211', message: 'Profile 2211: OpenAPI v3 annotations (io.swagger.v3.oas.annotations) are generated.', hint: 'Requires the swaggerintegration setup of 2211. javax.* vs jakarta.* namespace for your exact patch level is not verified by this tool.' });
  d.push({ severity: 'info', code: 'scope.static', message: 'Static checks only: they do not prove the code compiles against your SAP Commerce installation.' });

  if (!c.packageName.trim()) d.push({ severity: 'error', code: 'pkg.missing', message: 'Package name is required.', path: 'packageName' });
  else if (!isPackageName(c.packageName.trim())) d.push({ severity: 'error', code: 'pkg.invalid', message: `"${c.packageName}" is not a valid Java package name.`, path: 'packageName' });
  else if (/[A-Z]/.test(c.packageName)) d.push({ severity: 'warning', code: 'pkg.case', message: 'Package names are conventionally lowercase.', path: 'packageName' });

  const cls = (name: string, label: string, path: string) => {
    if (!name.trim()) d.push({ severity: 'error', code: 'class.missing', message: `${label} is required.`, path });
    else if (!isJavaIdentifier(name.trim())) d.push({ severity: 'error', code: 'class.invalid', message: `"${name}" is not a valid Java class name.`, path });
    else if (!/^[A-Z]/.test(name.trim())) d.push({ severity: 'warning', code: 'class.case', message: `${label} "${name}" should start with an uppercase letter.`, path });
  };
  cls(c.controllerName, 'Controller class name', 'controllerName');
  if (c.controllerName.trim() && !c.controllerName.endsWith('Controller')) d.push({ severity: 'info', code: 'class.suffix', message: 'Controller class names conventionally end with "Controller".', path: 'controllerName' });

  checkPath(d, c.basePath.trim(), 'Base path', 'basePath', { allowEmpty: false });

  if (c.endpoints.length === 0) d.push({ severity: 'error', code: 'endpoints.none', message: 'Add at least one endpoint.', path: 'endpoints' });
  const names = new Map<string, number>();
  const mappings = new Map<string, string>();
  c.endpoints.forEach((e, i) => {
    validateEndpoint(c, e, i, d);
    if (e.methodName) {
      if (names.has(e.methodName)) d.push({ severity: 'error', code: 'method.dup', message: `Duplicate method name "${e.methodName}" (endpoints ${names.get(e.methodName)! + 1} and ${i + 1}).`, path: `endpoints[${i}]` });
      else names.set(e.methodName, i);
    }
    const key = `${e.httpMethod} ${fullPath(c, e).replace(PLACEHOLDER, '{}')}|${e.consumes}`;
    if (mappings.has(key)) d.push({ severity: 'error', code: 'mapping.dup', message: `Endpoints "${mappings.get(key)}" and "${e.methodName}" map to the same request (${e.httpMethod} ${fullPath(c, e)}).`, path: `endpoints[${i}]` });
    else mappings.set(key, e.methodName);
  });

  // extra class annotations
  for (const a of c.extraClassAnnotations) {
    const m = /^@([A-Za-z_][\w.]*)(\(.*\))?$/s.exec(a.trim());
    if (!m) { d.push({ severity: 'error', code: 'ann.syntax', message: `Class annotation "${a}" is not valid annotation syntax.`, path: 'extraClassAnnotations' }); continue; }
    const simple = m[1].split('.').pop()!;
    if (OWN_ANNOTATIONS.has(simple)) d.push({ severity: 'error', code: 'ann.conflict', message: `@${simple} is generated by the tool and conflicts with the extra annotation.`, hint: 'Use the Controller annotation selector and base path field instead.', path: 'extraClassAnnotations' });
    else if (c.profile === '2211' && V1.has(simple)) d.push({ severity: 'warning', code: 'ann.profile', message: `@${simple} is a Swagger v1 annotation but profile 2211 generates OpenAPI v3 annotations.`, path: 'extraClassAnnotations' });
    else if (c.profile === '2205' && V3.has(simple)) d.push({ severity: 'warning', code: 'ann.profile', message: `@${simple} is an OpenAPI v3 annotation but profile 2205 generates Swagger v1 annotations.`, path: 'extraClassAnnotations' });
    else d.push({ severity: 'warning', code: 'ann.import', message: `@${simple} is emitted as written; no import is generated for it.`, hint: 'Add the import manually.', path: 'extraClassAnnotations' });
  }

  // DTO
  if (c.dto.enabled) {
    cls(c.dto.className, 'DTO class name', 'dto.className');
    if (!isPackageName(c.dto.packageName.trim())) d.push({ severity: 'error', code: 'pkg.invalid', message: `DTO package "${c.dto.packageName}" is not valid.`, path: 'dto.packageName' });
    if (c.dto.className.trim() && !/WsDTO$/.test(c.dto.className)) d.push({ severity: 'info', code: 'dto.suffix', message: 'OCC DTOs are conventionally named *WsDTO.', path: 'dto.className' });
    const fn = new Set<string>();
    c.dto.fields.forEach((f, i) => {
      const fp = `dto.fields[${i}]`;
      if (!isJavaIdentifier(f.name)) d.push({ severity: 'error', code: 'dto.field.name', message: `DTO field "${f.name}" is not a valid Java identifier.`, path: fp });
      else if (fn.has(f.name)) d.push({ severity: 'error', code: 'dto.field.dup', message: `Duplicate DTO field "${f.name}".`, path: fp });
      fn.add(f.name);
      if (!parseJavaType(f.javaType) || f.javaType.trim() === 'void') d.push({ severity: 'error', code: 'dto.field.type', message: `DTO field "${f.name}" has invalid type "${f.javaType}".`, path: fp });
    });
    if (c.dto.fields.length === 0) d.push({ severity: 'warning', code: 'dto.empty', message: 'The DTO has no fields.', path: 'dto.fields' });
    if (c.dto.fields.some((f) => f.required)) d.push({ severity: 'info', code: 'dto.validation', message: 'Required DTO fields use javax.validation.constraints.NotNull. If your platform uses the jakarta namespace, adjust the import.' });
    const used = c.endpoints.some((e) => e.params.some((p) => parseJavaType(p.javaType)?.name === c.dto.className) || parseJavaType(e.returnType)?.name === c.dto.className);
    if (!used) d.push({ severity: 'info', code: 'dto.unused', message: `No endpoint uses ${c.dto.className} as a parameter or return type.`, path: 'dto' });
  }

  // facade / validator
  if (c.facade.enabled) {
    cls(c.facade.interfaceName, 'Facade interface name', 'facade.interfaceName');
    cls(c.facade.implName, 'Facade implementation name', 'facade.implName');
    if (!isPackageName(c.facade.packageName.trim())) d.push({ severity: 'error', code: 'pkg.invalid', message: `Facade package "${c.facade.packageName}" is not valid.`, path: 'facade.packageName' });
    d.push({ severity: 'info', code: 'facade.scaffold', message: 'Facade files are scaffolding: they throw UnsupportedOperationException and need Spring bean wiring.' });
  }
  if (c.validator.enabled) {
    cls(c.validator.className, 'Validator class name', 'validator.className');
    if (!isPackageName(c.validator.packageName.trim())) d.push({ severity: 'error', code: 'pkg.invalid', message: `Validator package "${c.validator.packageName}" is not valid.`, path: 'validator.packageName' });
    if (!c.endpoints.some((e) => e.params.some((p) => p.kind === 'body'))) d.push({ severity: 'warning', code: 'validator.unused', message: 'Validator enabled but no endpoint has a request body; the controller will not call it.' });
  }

  // duplicate generated files
  const paths = new Map<string, string>();
  for (const f of plannedClasses(c)) {
    if (!f.name.trim() || !isPackageName(f.pkg.trim() || 'x')) continue;
    const pth = pathOf(f.pkg, f.name);
    if (paths.has(pth)) d.push({ severity: 'error', code: 'file.dup', message: `Two generated classes would write ${pth}.`, path: 'files' });
    paths.set(pth, f.kind);
  }
  const simple = new Map<string, string>();
  for (const f of plannedClasses(c)) {
    if (simple.has(f.name) && simple.get(f.name) !== f.pkg) d.push({ severity: 'warning', code: 'file.samename', message: `Class name ${f.name} is used in two packages; fully qualified names will be used where they clash.` });
    simple.set(f.name, f.pkg);
  }

  // unknown unqualified types
  const known = new Set([...JAVA_LANG, ...SCALAR_TYPES, ...Object.keys(KNOWN_TYPES), c.dto.enabled ? c.dto.className : '']);
  const warned = new Set<string>();
  const checkType = (t: string, where: string) => {
    const pt = parseJavaType(t);
    if (!pt) return;
    const visit = (x: typeof pt) => {
      if (!x.name.includes('.') && !known.has(x.name) && !warned.has(x.name)) {
        warned.add(x.name);
        d.push({ severity: 'warning', code: 'type.noimport', message: `Type ${x.name} (${where}) is not in the catalogue; no import is generated.`, hint: 'Use a fully qualified name or add the import manually.' });
      }
      x.args.forEach(visit);
    };
    visit(pt);
  };
  c.endpoints.forEach((e) => { checkType(e.returnType, e.methodName); e.params.forEach((p) => checkType(p.javaType, e.methodName)); });
  if (c.dto.enabled) c.dto.fields.forEach((f) => checkType(f.javaType, c.dto.className));
  return d;
}
