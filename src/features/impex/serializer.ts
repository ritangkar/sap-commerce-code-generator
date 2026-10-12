import type { ImpexColumn, ImpexConfig } from './model';

export interface SerializedImpex {
  text: string;
  lines: string[];
  /** 1-based line numbers. */
  macroLines: number[];
  headerLine: number;
  /** 1-based first line of each data row (rows may span several lines when cells contain newlines). */
  rowLines: number[];
}

/** Quote a cell only when required; embedded quotes are doubled. Empty stays empty. */
export function escapeCell(v: string): string {
  if (/[;"\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Canonical modifier order: unique, lang, allownull, default, then raw modifiers verbatim. */
export function columnModifiers(c: ImpexColumn): string {
  const parts: string[] = [];
  if (c.unique) parts.push('unique=true');
  if (c.lang.trim()) parts.push(`lang=${c.lang.trim()}`);
  if (c.allowNull) parts.push('allownull=true');
  if (c.defaultValue !== '') parts.push(`default=${c.defaultValue}`);
  if (c.rawModifiers.trim()) parts.push(c.rawModifiers.trim());
  return parts.join(',');
}

export function columnHeader(c: ImpexColumn): string {
  const m = columnModifiers(c);
  return `${c.attribute.trim()}${m ? `[${m}]` : ''}`;
}

export function serializeImpex(config: ImpexConfig): SerializedImpex {
  const lines: string[] = [];
  const macroLines: number[] = [];
  const rowLines: number[] = [];

  if (config.comment.trim()) {
    for (const l of config.comment.replace(/\r\n?/g, '\n').split('\n')) lines.push(l.trim() ? `# ${l}` : '#');
    lines.push('');
  }
  for (const m of config.macros) {
    macroLines.push(lines.length + 1);
    lines.push(`$${m.name.trim()}=${m.value}`);
  }
  if (config.macros.length > 0) lines.push('');

  const type = config.type.trim();
  const tm = config.typeModifiers.trim();
  const header = `${config.mode} ${type}${tm ? `[${tm}]` : ''}${config.columns.map((c) => `;${columnHeader(c)}`).join('')}`;
  const headerLine = lines.length + 1;
  lines.push(header);

  for (const row of config.rows) {
    rowLines.push(lines.length + 1);
    // Leading ";" is the empty type column of an ImpEx data row. Cells are never trimmed or rewritten.
    const text = `;${row.map(escapeCell).join(';')}`;
    // Quoted cells may contain newlines; keep them as part of one logical entry.
    lines.push(...text.split('\n'));
  }
  return { text: lines.join('\n') + '\n', lines, macroLines, headerLine, rowLines };
}
