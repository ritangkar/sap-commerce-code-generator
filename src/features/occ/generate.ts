import { fullPath, normSegment, type DtoField, type OccConfig, type OccEndpoint, type OccParam } from './model';
import { HTTP_STATUS_NAMES, ImportSet, MEDIA_TYPE_CONSTANTS, jstr, parseJavaType } from './javaTypes';

export type FileKind = 'controller' | 'dto' | 'facade' | 'facadeImpl' | 'validator';

export interface GeneratedFile {
  kind: FileKind;
  /** Relative path, e.g. src/com/example/FooController.java */
  path: string;
  name: string;
  content: string;
  purpose: string;
}

const I = '    ';
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const javadocText = (s: string) => s.replace(/\*\//g, '* /').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trimEnd());

function javadoc(indent: string, lines: string[]): string {
  const clean = lines.filter((l, i) => l !== '' || (i > 0 && lines[i - 1] !== ''));
  return `${indent}/**\n${clean.map((l) => (l ? `${indent} * ${l}` : `${indent} *`)).join('\n')}\n${indent} */\n`;
}

const mediaExpr = (v: string, imports: ImportSet): string => {
  const c = MEDIA_TYPE_CONSTANTS[v.trim().toLowerCase()];
  if (c) {
    imports.add('org.springframework.http.MediaType');
    return c;
  }
  return jstr(v.trim());
};

export const dtoFqn = (c: OccConfig) => `${c.dto.packageName}.${c.dto.className}`;
const localTypes = (c: OccConfig): Record<string, string> => (c.dto.enabled ? { [c.dto.className]: dtoFqn(c) } : {});
export const pathOf = (pkg: string, name: string) => `src/${pkg.split('.').join('/')}/${name}.java`;

/** Names of all files that would be generated, with class names, used by validation too. */
export function plannedClasses(c: OccConfig): { kind: FileKind; pkg: string; name: string }[] {
  const out: { kind: FileKind; pkg: string; name: string }[] = [{ kind: 'controller', pkg: c.packageName, name: c.controllerName }];
  if (c.dto.enabled) out.push({ kind: 'dto', pkg: c.dto.packageName, name: c.dto.className });
  if (c.facade.enabled) {
    out.push({ kind: 'facade', pkg: c.facade.packageName, name: c.facade.interfaceName });
    out.push({ kind: 'facadeImpl', pkg: c.facade.packageName, name: c.facade.implName });
  }
  if (c.validator.enabled) out.push({ kind: 'validator', pkg: c.validator.packageName, name: c.validator.className });
  return out;
}

const beanName = (cls: string) => cls.charAt(0).toLowerCase() + cls.slice(1);

function paramAnnotation(p: OccParam, c: OccConfig, im: ImportSet): string {
  const parts: string[] = [];
  if (p.description.trim()) {
    const req = p.kind === 'body' || p.required;
    if (c.profile === '2205') {
      im.add('io.swagger.annotations.ApiParam');
      parts.push(`@ApiParam(value = ${jstr(p.description.trim())}, required = ${req})`);
    } else {
      im.add('io.swagger.v3.oas.annotations.Parameter');
      parts.push(`@Parameter(description = ${jstr(p.description.trim())}, required = ${req})`);
    }
  }
  const args: string[] = [];
  const hasDefault = p.defaultValue !== '';
  switch (p.kind) {
    case 'path':
      im.add('org.springframework.web.bind.annotation.PathVariable');
      parts.push(`@PathVariable(value = ${jstr(p.name)})`);
      break;
    case 'query':
    case 'header': {
      const ann = p.kind === 'query' ? 'RequestParam' : 'RequestHeader';
      im.add(`org.springframework.web.bind.annotation.${ann}`);
      args.push(`value = ${jstr(p.name)}`);
      if (hasDefault) args.push(`defaultValue = ${jstr(p.defaultValue)}`);
      else if (!p.required) args.push('required = false');
      parts.push(`@${ann}(${args.join(', ')})`);
      break;
    }
    case 'body':
      im.add('org.springframework.web.bind.annotation.RequestBody');
      parts.push('@RequestBody');
      break;
  }
  return parts.join(' ');
}

const paramDecl = (p: OccParam, c: OccConfig, im: ImportSet) => `${paramAnnotation(p, c, im)} final ${im.type(p.javaType)} ${p.javaName}`;

function bodyParam(e: OccEndpoint): OccParam | undefined {
  return e.params.find((p) => p.kind === 'body');
}

function swaggerOperation(c: OccConfig, e: OccEndpoint, im: ImportSet): string[] {
  const out: string[] = [];
  const summary = e.summary.trim();
  const desc = e.description.trim();
  if (summary || desc) {
    if (c.profile === '2205') {
      im.add('io.swagger.annotations.ApiOperation');
      const a = [`value = ${jstr(summary || e.methodName)}`];
      if (desc) a.push(`notes = ${jstr(desc)}`);
      a.push(`nickname = ${jstr(e.methodName)}`);
      out.push(`@ApiOperation(${a.join(', ')})`);
    } else {
      im.add('io.swagger.v3.oas.annotations.Operation');
      const a: string[] = [];
      if (summary) a.push(`summary = ${jstr(summary)}`);
      if (desc) a.push(`description = ${jstr(desc)}`);
      a.push(`operationId = ${jstr(e.methodName)}`);
      out.push(`@Operation(${a.join(', ')})`);
    }
  }
  const codes = [...e.responseCodes].sort((a, b) => a.code - b.code);
  if (codes.length) {
    if (c.profile === '2205') {
      im.add('io.swagger.annotations.ApiResponse');
      im.add('io.swagger.annotations.ApiResponses');
      out.push(`@ApiResponses(value = {\n${codes.map((r) => `${I}${I}@ApiResponse(code = ${r.code}, message = ${jstr(r.description)})`).join(',\n')} })`);
    } else {
      im.add('io.swagger.v3.oas.annotations.responses.ApiResponse');
      im.add('io.swagger.v3.oas.annotations.responses.ApiResponses');
      out.push(`@ApiResponses(value = {\n${codes.map((r) => `${I}${I}@ApiResponse(responseCode = ${jstr(String(r.code))}, description = ${jstr(r.description)})`).join(',\n')} })`);
    }
  }
  return out;
}

function generateController(c: OccConfig): GeneratedFile {
  const im = new ImportSet(c.packageName, [c.controllerName], localTypes(c));
  const ctrlAnn = c.classAnnotation;
  im.add(ctrlAnn === 'Controller' ? 'org.springframework.stereotype.Controller' : 'org.springframework.web.bind.annotation.RestController');
  im.add('org.springframework.web.bind.annotation.RequestMapping');
  const classAnn: string[] = [`@${ctrlAnn}`, `@RequestMapping(value = ${jstr(c.basePath.trim())})`];
  if (c.apiTag.trim()) {
    if (c.profile === '2205') {
      im.add('io.swagger.annotations.Api');
      classAnn.push(`@Api(tags = ${jstr(c.apiTag.trim())})`);
    } else {
      im.add('io.swagger.v3.oas.annotations.tags.Tag');
      classAnn.push(`@Tag(name = ${jstr(c.apiTag.trim())})`);
    }
  }
  for (const a of c.extraClassAnnotations) if (a.trim()) classAnn.push(a.trim());

  const facadeVar = beanName(c.facade.interfaceName);
  const validatorVar = beanName(c.validator.className);
  const fields: string[] = [];
  const anyBody = c.endpoints.some((e) => bodyParam(e));
  if (c.facade.enabled) {
    im.add('javax.annotation.Resource');
    const t = im.add(`${c.facade.packageName}.${c.facade.interfaceName}`);
    fields.push(`${I}@Resource(name = ${jstr(facadeVar)})\n${I}private ${t} ${facadeVar};`);
  }
  if (c.validator.enabled && anyBody) {
    im.add('javax.annotation.Resource');
    im.add('org.springframework.validation.Validator');
    fields.push(`${I}@Resource(name = ${jstr(validatorVar)})\n${I}private Validator ${validatorVar};`);
  }

  const methods = c.endpoints.map((e) => {
    const lines: string[] = [];
    // Javadoc
    const doc = [...javadocText(e.summary.trim() || e.methodName)];
    if (e.description.trim()) doc.push('', ...javadocText(e.description.trim()));
    if (e.params.length || e.returnType.trim() !== 'void') doc.push('');
    for (const p of e.params) doc.push(`@param ${p.javaName} ${javadocText(p.description.trim() || `${p.kind} parameter`)[0]}`);
    if (e.returnType.trim() !== 'void') doc.push(`@return ${e.returnType.trim()}`);
    lines.push(javadoc(I, doc).replace(/\n$/, ''));
    if (e.roles.length) {
      im.add('org.springframework.security.access.annotation.Secured');
      lines.push(`${I}@Secured({ ${e.roles.map(jstr).join(', ')} })`);
    }
    const ma = [`value = ${jstr(normSegment(e.path))}`];
    if (c.mappingStyle === 'RequestMapping') ma.push(`method = RequestMethod.${e.httpMethod}`);
    if (e.consumes.trim()) ma.push(`consumes = ${mediaExpr(e.consumes, im)}`);
    if (e.produces.trim()) ma.push(`produces = ${mediaExpr(e.produces, im)}`);
    if (c.mappingStyle === 'Shortcut') {
      const ann = `${e.httpMethod.charAt(0)}${e.httpMethod.slice(1).toLowerCase()}Mapping`;
      im.add(`org.springframework.web.bind.annotation.${ann}`);
      lines.push(`${I}@${ann}(${ma.join(', ')})`);
    } else {
      im.add('org.springframework.web.bind.annotation.RequestMethod');
      lines.push(`${I}@RequestMapping(${ma.join(', ')})`);
    }
    if (ctrlAnn === 'Controller') {
      im.add('org.springframework.web.bind.annotation.ResponseBody');
      lines.push(`${I}@ResponseBody`);
    }
    const st = e.successStatus;
    if (st !== 200) {
      im.add('org.springframework.web.bind.annotation.ResponseStatus');
      im.add('org.springframework.http.HttpStatus');
      lines.push(`${I}@ResponseStatus(HttpStatus.${HTTP_STATUS_NAMES[st] ?? 'OK'})`);
    }
    for (const a of swaggerOperation(c, e, im)) lines.push(a.split('\n').map((l) => (l.startsWith(I + I) ? I + l : `${I}${l}`)).join('\n'));

    const ret = im.type(e.returnType.trim() || 'void');
    const params = e.params.map((p) => paramDecl(p, c, im));
    const head = `${I}public ${ret} ${e.methodName}(${params.join(`,\n${I}${I}${I}`)})`;
    lines.push(head);

    const body: string[] = [];
    const bp = bodyParam(e);
    if (bp && c.validator.enabled) {
      im.add('org.springframework.validation.BeanPropertyBindingResult');
      im.add('org.springframework.validation.Errors');
      im.add('de.hybris.platform.webservicescommons.errors.exceptions.WebserviceValidationException');
      body.push(`// TODO: verify the WebserviceValidationException import for your Commerce version`);
      body.push(`final Errors errors = new BeanPropertyBindingResult(${bp.javaName}, ${jstr(bp.javaName)});`);
      body.push(`${validatorVar}.validate(${bp.javaName}, errors);`);
      body.push('if (errors.hasErrors())', '{', `${I}throw new WebserviceValidationException(errors);`, '}');
    }
    const args = e.params.map((p) => p.javaName).join(', ');
    if (c.facade.enabled) {
      body.push(e.returnType.trim() === 'void' ? `${facadeVar}.${e.methodName}(${args});` : `return ${facadeVar}.${e.methodName}(${args});`);
    } else {
      body.push(`// TODO: implement ${e.methodName} (service/facade calls and DTO mapping are project-specific)`);
      body.push(`throw new UnsupportedOperationException(${jstr(`TODO: implement ${e.methodName}`)});`);
    }
    lines.push(`${I}{`, ...body.map((l) => `${I}${I}${l}`), `${I}}`);
    return lines.join('\n');
  });

  const header = `package ${c.packageName};\n\n`;
  const imports = im.render();
  const classBody = [...fields, ...methods].join('\n\n');
  const content = `${header}${imports ? imports + '\n' : ''}${classAnn.join('\n')}\npublic class ${c.controllerName}\n{\n${classBody}\n}\n`;
  return { kind: 'controller', path: pathOf(c.packageName, c.controllerName), name: `${c.controllerName}.java`, content, purpose: 'OCC controller with the configured endpoints.' };
}

function fieldType(f: DtoField, im: ImportSet) {
  return im.type(f.javaType);
}

function generateDto(c: OccConfig): GeneratedFile {
  const d = c.dto;
  const im = new ImportSet(d.packageName, [d.className], localTypes(c));
  im.add('java.io.Serializable');
  const anyRequired = d.fields.some((f) => f.required);
  if (anyRequired) im.add('javax.validation.constraints.NotNull');
  const cls: string[] = [];
  if (c.profile === '2205') {
    im.add('io.swagger.annotations.ApiModel');
    cls.push(`@ApiModel(value = ${jstr(d.className)}, description = ${jstr(d.description.trim())})`);
  } else if (d.description.trim()) {
    im.add('io.swagger.v3.oas.annotations.media.Schema');
    cls.push(`@Schema(description = ${jstr(d.description.trim())})`);
  }
  const body: string[] = [`${I}private static final long serialVersionUID = 1L;`];
  const fieldBlocks = d.fields.map((f) => {
    const l: string[] = [];
    if (f.required) l.push(`${I}@NotNull`);
    if (c.profile === '2205') {
      if (f.description.trim() || f.required) {
        im.add('io.swagger.annotations.ApiModelProperty');
        l.push(`${I}@ApiModelProperty(value = ${jstr(f.description.trim())}, required = ${f.required})`);
      }
    } else if (f.description.trim() || f.required) {
      im.add('io.swagger.v3.oas.annotations.media.Schema');
      l.push(`${I}@Schema(description = ${jstr(f.description.trim())}${f.required ? ', required = true' : ''})`);
    }
    l.push(`${I}private ${fieldType(f, im)} ${f.name};`);
    return l.join('\n');
  });
  const accessors = d.fields.map((f) => {
    const t = fieldType(f, im);
    const getter = (t === 'boolean' ? 'is' : 'get') + cap(f.name);
    return `${I}public ${t} ${getter}()\n${I}{\n${I}${I}return ${f.name};\n${I}}\n\n${I}public void set${cap(f.name)}(final ${t} ${f.name})\n${I}{\n${I}${I}this.${f.name} = ${f.name};\n${I}}`;
  });
  const parts = [body.join('\n'), ...fieldBlocks, ...accessors];
  const content = `package ${d.packageName};\n\n${im.render()}\n${cls.join('\n')}${cls.length ? '\n' : ''}public class ${d.className} implements Serializable\n{\n${parts.join('\n\n')}\n}\n`;
  return { kind: 'dto', path: pathOf(d.packageName, d.className), name: `${d.className}.java`, content, purpose: 'Request/supporting WsDTO class (hand-written; SAP Commerce projects usually generate WsDTOs from *-beans.xml).' };
}

function methodSignature(e: OccEndpoint, im: ImportSet, final = true): string {
  return `${im.type(e.returnType.trim() || 'void')} ${e.methodName}(${e.params.map((p) => `${final ? 'final ' : ''}${im.type(p.javaType)} ${p.javaName}`).join(', ')})`;
}

function generateFacade(c: OccConfig): GeneratedFile {
  const f = c.facade;
  const im = new ImportSet(f.packageName, [f.interfaceName], localTypes(c));
  const sigs = c.endpoints.map((e) => {
    const doc = javadoc(I, ['TODO: ' + (e.summary.trim() || e.methodName), 'Facades normally work with *Data objects; map to/from WsDTOs in the controller layer if your project follows that convention.']);
    return `${doc}${I}${methodSignature(e, im, false)};`;
  });
  const imports = im.render();
  const content = `package ${f.packageName};\n\n${imports ? imports + '\n' : ''}/**\n * Facade skeleton for ${c.controllerName}. Scaffolding only: no business logic.\n */\npublic interface ${f.interfaceName}\n{\n${sigs.join('\n\n')}\n}\n`;
  return { kind: 'facade', path: pathOf(f.packageName, f.interfaceName), name: `${f.interfaceName}.java`, content, purpose: 'Facade interface skeleton called by the controller.' };
}

function generateFacadeImpl(c: OccConfig): GeneratedFile {
  const f = c.facade;
  const im = new ImportSet(f.packageName, [f.implName], localTypes(c));
  const methods = c.endpoints.map((e) =>
    `${I}@Override\n${I}public ${methodSignature(e, im)}\n${I}{\n${I}${I}// TODO: inject and call project-specific services, converters/populators and models here\n${I}${I}throw new UnsupportedOperationException(${jstr(`TODO: implement ${e.methodName}`)});\n${I}}`);
  const imports = im.render();
  const content = `package ${f.packageName};\n\n${imports ? imports + '\n' : ''}/**\n * Facade implementation skeleton. TODO: declare this class as a Spring bean named "${beanName(f.interfaceName)}" in your extension's *-spring.xml.\n */\npublic class ${f.implName} implements ${f.interfaceName}\n{\n${methods.join('\n\n')}\n}\n`;
  return { kind: 'facadeImpl', path: pathOf(f.packageName, f.implName), name: `${f.implName}.java`, content, purpose: 'Facade implementation skeleton (throws UnsupportedOperationException until implemented).' };
}

function generateValidator(c: OccConfig): GeneratedFile {
  const v = c.validator;
  const im = new ImportSet(v.packageName, [v.className]);
  im.add('org.springframework.validation.Errors');
  im.add('org.springframework.validation.Validator');
  const target = c.dto.enabled ? im.add(dtoFqn(c)) : null;
  const rules: string[] = [];
  if (c.dto.enabled) {
    for (const f of c.dto.fields.filter((x) => x.required && parseJavaType(x.javaType)?.name === 'String')) {
      im.add('org.springframework.validation.ValidationUtils');
      rules.push(`${I}${I}ValidationUtils.rejectIfEmptyOrWhitespace(errors, ${jstr(f.name)}, ${jstr(`${f.name}.required`)});`);
    }
  }
  const supports = target ? `${target}.class.equals(clazz)` : `true /* TODO: restrict to the supported request type */`;
  const content = `package ${v.packageName};\n\n${im.render()}\n/**\n * Validator skeleton. TODO: add project-specific validation rules and message keys.\n */\npublic class ${v.className} implements Validator\n{\n${I}@Override\n${I}public boolean supports(final Class<?> clazz)\n${I}{\n${I}${I}return ${supports};\n${I}}\n\n${I}@Override\n${I}public void validate(final Object target, final Errors errors)\n${I}{\n${rules.length ? rules.join('\n') + '\n' : ''}${I}${I}// TODO: add further validation rules\n${I}}\n}\n`;
  return { kind: 'validator', path: pathOf(v.packageName, v.className), name: `${v.className}.java`, content, purpose: 'Spring Validator skeleton (basic required-field checks only).' };
}

/** Deterministic: identical config always yields identical files, in a fixed order. */
export function generateFiles(c: OccConfig): GeneratedFile[] {
  const files: GeneratedFile[] = [generateController(c)];
  if (c.dto.enabled) files.push(generateDto(c));
  if (c.facade.enabled) files.push(generateFacade(c), generateFacadeImpl(c));
  if (c.validator.enabled) files.push(generateValidator(c));
  return files;
}

export { fullPath };
