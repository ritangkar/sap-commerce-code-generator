export type Lang = 'java' | 'impex' | 'json' | 'text';
export interface Token {
  cls: string;
  text: string;
}

const JAVA_KW = new Set(['package', 'import', 'public', 'private', 'protected', 'class', 'interface', 'implements', 'extends', 'final', 'static', 'void', 'return', 'new', 'throw', 'if', 'else', 'this', 'throws', 'true', 'false', 'null', 'boolean', 'int', 'long', 'double']);

interface Rule {
  re: RegExp;
  cls: string | ((m: string) => string);
}

const javaRules: Rule[] = [
  { re: /^\/\/.*/, cls: 'tk-comment' },
  { re: /^"(?:[^"\\]|\\.)*"?/, cls: 'tk-string' },
  { re: /^@[A-Za-z_][\w.]*/, cls: 'tk-ann' },
  { re: /^\b\d[\d_.]*[LlDdFf]?\b/, cls: 'tk-num' },
  { re: /^[A-Za-z_$][\w$]*/, cls: (m) => (JAVA_KW.has(m) ? 'tk-kw' : /^[A-Z]/.test(m) ? 'tk-type' : '') },
];

const impexRules: Rule[] = [
  { re: /^#.*/, cls: 'tk-comment' },
  { re: /^\$[A-Za-z_][\w-]*/, cls: 'tk-macro' },
  { re: /^(INSERT_UPDATE|INSERT|UPDATE|REMOVE)\b/, cls: 'tk-kw' },
  { re: /^\[[^\]]*\]/, cls: 'tk-mod' },
  { re: /^"(?:[^"]|"")*"?/, cls: 'tk-string' },
  { re: /^;/, cls: 'tk-punct' },
];

const jsonRules: Rule[] = [
  { re: /^"(?:[^"\\]|\\.)*"(?=\s*:)/, cls: 'tk-ann' },
  { re: /^"(?:[^"\\]|\\.)*"?/, cls: 'tk-string' },
  { re: /^(true|false|null)\b/, cls: 'tk-kw' },
  { re: /^-?\d[\d.eE+-]*/, cls: 'tk-num' },
];

const rulesFor = (lang: Lang): Rule[] => (lang === 'java' ? javaRules : lang === 'impex' ? impexRules : lang === 'json' ? jsonRules : []);

/** Tokenise code line by line. Block comments (Java) carry across lines. */
export function highlightLines(code: string, lang: Lang): Token[][] {
  const rules = rulesFor(lang);
  const lines = code.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  let inBlock = false;
  return lines.map((line) => {
    if (rules.length === 0) return [{ cls: '', text: line }];
    const out: Token[] = [];
    let rest = line;
    const push = (cls: string, text: string) => {
      const last = out[out.length - 1];
      if (last && last.cls === cls) last.text += text;
      else out.push({ cls, text });
    };
    while (rest.length) {
      if (inBlock) {
        const end = rest.indexOf('*/');
        if (end === -1) { push('tk-comment', rest); rest = ''; }
        else { push('tk-comment', rest.slice(0, end + 2)); rest = rest.slice(end + 2); inBlock = false; }
        continue;
      }
      if (lang === 'java' && rest.startsWith('/*')) {
        const end = rest.indexOf('*/', 2);
        if (end === -1) { push('tk-comment', rest); rest = ''; inBlock = true; }
        else { push('tk-comment', rest.slice(0, end + 2)); rest = rest.slice(end + 2); }
        continue;
      }
      let matched = false;
      for (const r of rules) {
        const m = r.re.exec(rest);
        if (m) {
          push(typeof r.cls === 'function' ? r.cls(m[0]) : r.cls, m[0]);
          rest = rest.slice(m[0].length);
          matched = true;
          break;
        }
      }
      if (!matched) {
        push('', rest[0]);
        rest = rest.slice(1);
      }
    }
    return out;
  });
}
