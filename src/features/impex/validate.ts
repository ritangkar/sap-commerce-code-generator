import type { Diagnostic } from '../../shared/diagnostics';
import { IMPEX_MODES, type ImpexConfig } from './model';
import { serializeImpex } from './serializer';

/** Types the tool ships examples for. This is NOT verified target-system metadata. */
export const KNOWN_TYPES = ['Product', 'Category', 'CatalogVersion', 'Catalog', 'Media', 'Customer', 'Title', 'Language', 'Currency', 'Unit', 'Country', 'Address', 'UserGroup', 'Employee', 'Keyword'];

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MACRO_REF = /\$(config-[\w.-]+|[A-Za-z_][A-Za-z0-9_]*)/g;

/** Names of references (without `$`) found in text. */
export function macroRefs(text: string): string[] {
  return [...text.matchAll(MACRO_REF)].map((m) => m[1]);
}

/** Replace `$name` with its value for the read-only expansion preview. Unknown names are left intact. */
export function expandMacros(text: string, defs: Map<string, string>, depth = 0): string {
  if (depth > 20) return text;
  return text.replace(MACRO_REF, (full, name: string) => {
    const v = defs.get(name);
    return v === undefined ? full : expandMacros(v, defs, depth + 1);
  });
}

export function macroDefs(c: ImpexConfig): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of c.macros) m.set(x.name.trim(), x.value); // later definitions win, like ImpEx
  return m;
}

function balanced(s: string): string | null {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[' };
  for (const ch of s) {
    if (ch === '(' || ch === '[') stack.push(ch);
    else if (ch === ')' || ch === ']') {
      if (stack.pop() !== pairs[ch]) return `Unbalanced "${ch}"`;
    }
  }
  return stack.length ? `Unclosed "${stack[stack.length - 1]}"` : null;
}

function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function validateImpex(c: ImpexConfig): Diagnostic[] {
  const d: Diagnostic[] = [];
  const ser = serializeImpex(c);
  const add = (x: Diagnostic) => d.push(x);

  if (!IMPEX_MODES.includes(c.mode)) add({ severity: 'error', code: 'mode.unsupported', message: `Unsupported import mode "${c.mode}".` });
  if (c.mode === 'REMOVE')
    add({ severity: 'warning', code: 'mode.remove', message: 'REMOVE deletes matching items when the script is imported.', hint: 'This tool never executes ImpEx; review carefully before running the script yourself, ideally on a non-production system.', line: ser.headerLine });

  // --- type ---
  const type = c.type.trim();
  if (!type) add({ severity: 'error', code: 'type.missing', message: 'Type is required.', path: 'type', line: ser.headerLine });
  else if (!IDENT.test(type)) add({ severity: 'error', code: 'type.syntax', message: `"${type}" is not a valid type code.`, hint: 'Type codes are letters, digits and underscores.', path: 'type', line: ser.headerLine });
  else if (!KNOWN_TYPES.includes(type))
    add({ severity: 'info', code: 'type.unverified', message: `Type "${type}" is not in the built-in examples.`, hint: 'Custom types cannot be verified offline. Check that the type exists in your type system.', path: 'type' });
  else add({ severity: 'info', code: 'type.example', message: `Type "${type}" is a common example type; its existence and attributes in your installation are not verified.`, path: 'type' });
  if (/[\n;]/.test(c.typeModifiers)) add({ severity: 'error', code: 'typemod.syntax', message: 'Type modifiers must not contain ";" or newlines.' });
  else if (c.typeModifiers.trim()) {
    const b = balanced(c.typeModifiers);
    if (b) add({ severity: 'error', code: 'typemod.syntax', message: `Type modifiers malformed: ${b}.` });
  }

  // --- macros ---
  const seen = new Map<string, number>();
  c.macros.forEach((m, i) => {
    const name = m.name.trim();
    const line = ser.macroLines[i];
    if (!IDENT.test(name)) add({ severity: 'error', code: 'macro.syntax', message: `Macro name "${m.name}" is invalid (use letters, digits, underscore; no "$").`, path: `macros[${i}]`, line });
    if (/[\n\r]/.test(m.value)) add({ severity: 'error', code: 'macro.multiline', message: `Macro "${name}" value contains a line break.`, path: `macros[${i}]`, line });
    if (m.value.trim() === '') add({ severity: 'warning', code: 'macro.empty', message: `Macro "${name}" has an empty value.`, path: `macros[${i}]`, line });
    const b = balanced(m.value);
    if (b) add({ severity: 'warning', code: 'macro.unbalanced', message: `Macro "${name}" value looks malformed: ${b}.`, path: `macros[${i}]`, line });
    if (seen.has(name))
      add({ severity: 'warning', code: 'macro.duplicate', message: `Macro "${name}" is defined more than once (also at position ${seen.get(name)! + 1}).`, hint: 'ImpEx uses the most recent definition; this is usually unintentional.', path: `macros[${i}]`, line });
    else seen.set(name, i);
  });
  // refs inside macros: undefined / used before definition / cycles
  const defs = macroDefs(c);
  const graph = new Map<string, string[]>();
  c.macros.forEach((m, i) => {
    const name = m.name.trim();
    const refs = macroRefs(m.value);
    graph.set(name, [...(graph.get(name) ?? []), ...refs.filter((r) => !r.startsWith('config-'))]);
    for (const r of refs) {
      if (r.startsWith('config-')) continue;
      if (!defs.has(r)) add({ severity: 'warning', code: 'macro.undefined', message: `Macro "${name}" references undefined macro $${r}.`, path: `macros[${i}]`, line: ser.macroLines[i] });
      else if (r !== name && c.macros.findIndex((x) => x.name.trim() === r) > i)
        add({ severity: 'warning', code: 'macro.order', message: `Macro "${name}" uses $${r} before it is defined.`, hint: 'Macros are resolved in order of definition.', path: `macros[${i}]`, line: ser.macroLines[i] });
    }
  });
  const state = new Map<string, number>();
  const reported = new Set<string>();
  const visit = (n: string, stack: string[]) => {
    if (state.get(n) === 2) return;
    if (state.get(n) === 1) {
      const cyc = [...stack.slice(stack.indexOf(n)), n];
      const key = [...cyc].sort().join('>');
      if (!reported.has(key)) {
        reported.add(key);
        add({ severity: 'error', code: 'macro.circular', message: `Circular macro reference: ${cyc.map((x) => '$' + x).join(' → ')}.`, path: 'macros' });
      }
      return;
    }
    state.set(n, 1);
    for (const r of graph.get(n) ?? []) if (graph.has(r)) visit(r, [...stack, n]);
    state.set(n, 2);
  };
  for (const n of graph.keys()) visit(n, []);

  // --- columns ---
  if (c.columns.length === 0) add({ severity: 'error', code: 'columns.none', message: 'Add at least one column.', path: 'columns', line: ser.headerLine });
  const colKeys = new Map<string, number>();
  c.columns.forEach((col, i) => {
    const path = `columns[${i}]`;
    const line = ser.headerLine;
    const label = col.attribute.trim() || `column ${i + 1}`;
    if (!col.attribute.trim()) add({ severity: 'error', code: 'column.empty', message: `Column ${i + 1} has no attribute.`, path, line });
    if (/[;\n\r]/.test(col.attribute)) add({ severity: 'error', code: 'column.chars', message: `Column ${i + 1} attribute contains ";" or a line break.`, path, line });
    if (/\[|\]/.test(col.attribute) && !col.attribute.trim().startsWith('$'))
      add({ severity: 'warning', code: 'column.brackets', message: `Attribute "${label}" contains brackets; put modifiers in the modifier fields to keep the header predictable.`, path, line });
    const b = balanced(col.attribute);
    if (b) add({ severity: 'error', code: 'column.expression', message: `Reference expression of "${label}" is malformed: ${b}.`, path, line });
    if (/\(\s*\)/.test(col.attribute)) add({ severity: 'warning', code: 'column.emptyref', message: `Reference expression of "${label}" has empty parentheses.`, path, line });
    if (/\(\s*,|,\s*\)|,\s*,/.test(col.attribute)) add({ severity: 'warning', code: 'column.incompleteref', message: `Reference expression of "${label}" looks incomplete (dangling comma).`, path, line });
    if (col.lang.trim() && !/^[a-z]{2,3}(_[A-Za-z0-9]+)?$/.test(col.lang.trim()) && !col.lang.includes('$'))
      add({ severity: 'warning', code: 'column.lang', message: `Language "${col.lang}" on "${label}" does not look like an ISO code (e.g. en, de, en_GB).`, hint: 'Whether the language exists in your system cannot be checked offline.', path, line });
    if (col.lang.trim() && col.attribute.includes('('))
      add({ severity: 'info', code: 'column.lang.ref', message: `"${label}" uses lang with a reference expression; verify this is valid for the attribute.`, path });
    if (col.allowNull && col.unique) add({ severity: 'warning', code: 'column.allownull.unique', message: `"${label}" combines unique=true and allownull=true; this is rarely intended.`, path, line });
    if (col.rawModifiers.trim()) {
      const rb = balanced(col.rawModifiers);
      if (rb || /[\n\r;]/.test(col.rawModifiers)) add({ severity: 'error', code: 'column.rawmods', message: `Raw modifiers of "${label}" are malformed${rb ? `: ${rb}` : ''}.`, path, line });
      else {
        const keys = new Set<string>();
        for (const part of splitTopLevel(col.rawModifiers)) {
          const m = /^\s*([A-Za-z][\w.]*)\s*=\s*(.*)$/s.exec(part);
          if (!m || m[2].trim() === '') add({ severity: 'warning', code: 'column.rawmods.shape', message: `Modifier "${part.trim()}" on "${label}" is not in key=value form.`, path, line });
          else {
            keys.add(m[1].toLowerCase());
          }
        }
        const structured = [col.unique && 'unique', col.lang.trim() && 'lang', col.allowNull && 'allownull', col.defaultValue !== '' && 'default'].filter(Boolean) as string[];
        for (const k of structured) if (keys.has(k)) add({ severity: 'warning', code: 'column.mod.dup', message: `Modifier "${k}" on "${label}" is set both in the fields and in raw modifiers.`, path, line });
      }
    }
    const key = `${col.attribute.trim()}|${col.lang.trim()}`;
    if (col.attribute.trim()) {
      if (colKeys.has(key)) add({ severity: 'warning', code: 'column.duplicate', message: `Duplicate column "${label}"${col.lang.trim() ? ` (lang=${col.lang.trim()})` : ''} (also column ${colKeys.get(key)! + 1}).`, path, line });
      else colKeys.set(key, i);
    }
    for (const r of [...macroRefs(col.attribute), ...macroRefs(col.rawModifiers), ...macroRefs(col.defaultValue), ...macroRefs(col.lang)])
      if (!r.startsWith('config-') && !defs.has(r)) add({ severity: 'warning', code: 'macro.undefined', message: `Column "${label}" references undefined macro $${r}.`, path, line });
    if (col.attribute.trim() && !col.attribute.includes('(') && !col.attribute.startsWith('$') && !/^[A-Za-z_][\w.]*$/.test(col.attribute.trim()))
      add({ severity: 'warning', code: 'column.suspicious', message: `Attribute "${label}" contains unusual characters.`, path, line });
  });
  if (c.columns.length && c.mode !== 'INSERT' && !c.columns.some((x) => x.unique || x.attribute.trim().startsWith('$') || /unique\s*=\s*true/i.test(x.rawModifiers)))
    add({ severity: 'warning', code: 'keys.missing', message: `No unique (identifying) column in a ${c.mode} script.`, hint: 'Without a unique key ImpEx cannot reliably match existing items. Mark the identifying attribute(s) unique.', path: 'columns', line: ser.headerLine });

  // --- rows ---
  if (c.rows.length === 0) add({ severity: 'info', code: 'rows.none', message: 'No data rows yet; the script contains only a header.' });
  const emptyPerCol = c.columns.map(() => 0);
  c.rows.forEach((row, r) => {
    const line = ser.rowLines[r];
    if (row.length !== c.columns.length) {
      add({ severity: 'error', code: 'row.length', message: `Row ${r + 1} has ${row.length} cells but the header has ${c.columns.length} columns.`, hint: 'Rows are never truncated or padded automatically.', path: `rows[${r}]`, line });
      return;
    }
    if (row.every((x) => x === '')) add({ severity: 'warning', code: 'row.empty', message: `Row ${r + 1} is completely empty.`, path: `rows[${r}]`, line });
    row.forEach((cell, i) => {
      if (cell === '') {
        emptyPerCol[i]++;
        const col = c.columns[i];
        if (col.unique) add({ severity: 'warning', code: 'cell.emptykey', message: `Row ${r + 1}: identifying column "${col.attribute}" is empty.`, hint: 'An empty cell is not a guaranteed null; ImpEx behaviour depends on the attribute and modifiers.', path: `rows[${r}][${i}]`, line });
      } else {
        if (cell !== cell.trim()) add({ severity: 'info', code: 'cell.whitespace', message: `Row ${r + 1}, column ${i + 1}: value has leading or trailing whitespace (kept as entered).`, path: `rows[${r}][${i}]`, line });
        for (const ref of macroRefs(cell)) if (!ref.startsWith('config-') && !defs.has(ref)) add({ severity: 'info', code: 'cell.macro.undefined', message: `Row ${r + 1}, column ${i + 1}: references undefined macro $${ref} (ignore if the "$" is literal text).`, path: `rows[${r}][${i}]` });
      }
    });
  });
  emptyPerCol.forEach((n, i) => {
    if (n > 0 && !c.columns[i].unique) add({ severity: 'info', code: 'cell.empty', message: `${n} empty cell${n > 1 ? 's' : ''} in column "${c.columns[i].attribute || i + 1}". Empty cells are written as empty values, not as <ignore> or null.`, path: `columns[${i}]` });
  });
  return d;
}
