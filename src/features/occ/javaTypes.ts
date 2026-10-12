/** Java type helpers: parsing, import resolution, default-value checks. Pure and UI-independent. */

export const JAVA_KEYWORDS = new Set(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null', '_']);

export const isJavaIdentifier = (s: string): boolean => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) && !JAVA_KEYWORDS.has(s);
export const isPackageName = (s: string): boolean => s.split('.').every((p) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(p) && !JAVA_KEYWORDS.has(p));

/** Simple name -> fully qualified name for types the tool knows. Entries marked `hint` are catalogue assumptions to verify. */
export const KNOWN_TYPES: Record<string, string> = {
  BigDecimal: 'java.math.BigDecimal',
  LocalDate: 'java.time.LocalDate',
  LocalDateTime: 'java.time.LocalDateTime',
  OffsetDateTime: 'java.time.OffsetDateTime',
  ZonedDateTime: 'java.time.ZonedDateTime',
  Instant: 'java.time.Instant',
  Date: 'java.util.Date',
  List: 'java.util.List',
  Set: 'java.util.Set',
  Map: 'java.util.Map',
  Collection: 'java.util.Collection',
  UUID: 'java.util.UUID',
  ProductWsDTO: 'de.hybris.platform.commercewebservicescommons.dto.product.ProductWsDTO',
  CartWsDTO: 'de.hybris.platform.commercewebservicescommons.dto.order.CartWsDTO',
  OrderWsDTO: 'de.hybris.platform.commercewebservicescommons.dto.order.OrderWsDTO',
  UserWsDTO: 'de.hybris.platform.commercewebservicescommons.dto.user.UserWsDTO',
  AddressWsDTO: 'de.hybris.platform.commercewebservicescommons.dto.user.AddressWsDTO',
};

/** Types that need no import. */
export const JAVA_LANG = new Set(['String', 'Integer', 'Long', 'Boolean', 'Double', 'Float', 'Short', 'Byte', 'Character', 'Object', 'Number', 'void', 'int', 'long', 'boolean', 'double', 'float', 'short', 'byte', 'char']);

export const TYPE_CATALOGUE = ['String', 'Integer', 'Long', 'Boolean', 'Double', 'BigDecimal', 'LocalDate', 'LocalDateTime', 'OffsetDateTime', 'Instant', 'Date', 'List<String>', 'Object', 'ProductWsDTO', 'CartWsDTO', 'OrderWsDTO', 'UserWsDTO', 'AddressWsDTO', 'void'];

export const SCALAR_TYPES = new Set(['String', 'Integer', 'Long', 'Boolean', 'Double', 'Float', 'Short', 'Byte', 'Character', 'BigDecimal', 'LocalDate', 'LocalDateTime', 'OffsetDateTime', 'ZonedDateTime', 'Instant', 'Date', 'UUID', 'int', 'long', 'boolean', 'double']);

export interface ParsedType {
  name: string;
  args: ParsedType[];
  array: boolean;
}

/** Parse e.g. `Map<String, List<Foo>>`, `com.x.Foo[]`. Returns null on syntax errors. */
export function parseJavaType(input: string): ParsedType | null {
  const src = input.trim();
  let i = 0;
  const ws = () => { while (src[i] === ' ') i++; };
  const parse = (): ParsedType | null => {
    ws();
    const m = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    const t: ParsedType = { name: m[0], args: [], array: false };
    ws();
    if (src[i] === '<') {
      i++;
      for (;;) {
        const a = parse();
        if (!a) return null;
        t.args.push(a);
        ws();
        if (src[i] === ',') { i++; continue; }
        if (src[i] === '>') { i++; break; }
        return null;
      }
    }
    ws();
    if (src.slice(i, i + 2) === '[]') { t.array = true; i += 2; }
    return t;
  };
  const t = parse();
  ws();
  if (!t || i !== src.length) return null;
  // reserved words are not type names (except primitives and void)
  const walk = (x: ParsedType): boolean => (x.name.includes('.') || JAVA_LANG.has(x.name) || !JAVA_KEYWORDS.has(x.name)) && x.args.every(walk);
  return walk(t) ? t : null;
}

export const baseTypeName = (t: string): string => parseJavaType(t)?.name.split('.').pop() ?? t.trim();

/** Collects imports deterministically and resolves simple-name conflicts to fully-qualified names. */
export class ImportSet {
  private imports = new Set<string>();
  private simpleToFqn = new Map<string, string>();
  constructor(private readonly ownPackage: string, private readonly reserved: string[] = [], private readonly local: Record<string, string> = {}) {}

  /** Register an FQN and return the name to use in source. */
  add(fqn: string): string {
    const simple = fqn.split('.').pop()!;
    const have = this.simpleToFqn.get(simple);
    if (have && have !== fqn) return fqn;
    if (this.reserved.includes(simple) && !fqn.startsWith(this.ownPackage + '.')) return fqn;
    this.simpleToFqn.set(simple, fqn);
    if (!fqn.startsWith('java.lang.') && fqn.split('.').slice(0, -1).join('.') !== this.ownPackage) this.imports.add(fqn);
    return simple;
  }

  /** Resolve a Java type string into source text, registering imports. Returns the original text if unparsable. */
  type(text: string): string {
    const p = parseJavaType(text);
    if (!p) return text.trim();
    const render = (t: ParsedType): string => {
      let name = t.name;
      if (name.includes('.')) name = this.add(name);
      else if (this.local[name]) name = this.add(this.local[name]);
      else if (KNOWN_TYPES[name]) name = this.add(KNOWN_TYPES[name]);
      const args = t.args.length ? `<${t.args.map(render).join(', ')}>` : '';
      return `${name}${args}${t.array ? '[]' : ''}`;
    };
    return render(p);
  }

  private rank(i: string): number {
    const order = ['java.', 'javax.', 'jakarta.', 'org.', 'io.', 'de.', 'com.'];
    const k = order.findIndex((p) => i.startsWith(p));
    return k === -1 ? order.length : k;
  }

  render(): string {
    const sorted = [...this.imports].sort((a, b) => this.rank(a) - this.rank(b) || (a < b ? -1 : a > b ? 1 : 0));
    let out = '';
    let prev = -1;
    for (const i of sorted) {
      const r = this.rank(i);
      if (prev !== -1 && r !== prev) out += '\n';
      out += `import ${i};\n`;
      prev = r;
    }
    return out;
  }
}

/** Returns an error message when `value` cannot be a valid default for `type`, else null (unknown/custom types are not checked). */
export function checkDefault(type: string, value: string): string | null {
  const t = baseTypeName(type);
  const v = value;
  const intRange = (min: bigint, max: bigint) => {
    if (!/^-?\d+$/.test(v)) return `"${v}" is not a valid ${t}.`;
    const x = BigInt(v);
    return x < min || x > max ? `"${v}" is out of range for ${t}.` : null;
  };
  switch (t) {
    case 'Integer': case 'int': return intRange(-(2n ** 31n), 2n ** 31n - 1n);
    case 'Long': case 'long': return intRange(-(2n ** 63n), 2n ** 63n - 1n);
    case 'Short': return intRange(-32768n, 32767n);
    case 'Byte': return intRange(-128n, 127n);
    case 'Boolean': case 'boolean': return v === 'true' || v === 'false' ? null : `"${v}" is not a valid Boolean (use true or false).`;
    case 'Double': case 'Float': case 'BigDecimal': case 'double': case 'float':
      return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v) ? null : `"${v}" is not a valid ${t}.`;
    case 'LocalDate': return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? null : `"${v}" is not an ISO date (yyyy-MM-dd).`;
    case 'LocalDateTime': return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v) ? null : `"${v}" is not an ISO local date-time (yyyy-MM-ddTHH:mm[:ss]).`;
    case 'Character': return v.length === 1 ? null : 'A Character default must be exactly one character.';
    default: return null;
  }
}

export const jstr = (s: string): string =>
  `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;

export const HTTP_STATUS_NAMES: Record<number, string> = {
  200: 'OK', 201: 'CREATED', 202: 'ACCEPTED', 204: 'NO_CONTENT', 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED', 409: 'CONFLICT', 415: 'UNSUPPORTED_MEDIA_TYPE', 500: 'INTERNAL_SERVER_ERROR',
};

export const MEDIA_TYPE_CONSTANTS: Record<string, string> = {
  'application/json': 'MediaType.APPLICATION_JSON_VALUE',
  'application/xml': 'MediaType.APPLICATION_XML_VALUE',
  'text/plain': 'MediaType.TEXT_PLAIN_VALUE',
  'multipart/form-data': 'MediaType.MULTIPART_FORM_DATA_VALUE',
  'application/x-www-form-urlencoded': 'MediaType.APPLICATION_FORM_URLENCODED_VALUE',
};
