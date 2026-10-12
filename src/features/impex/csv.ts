import type { ImpexConfig } from './model';

export interface CsvIssue {
  severity: 'error' | 'warning';
  line: number;
  message: string;
}

export interface CsvParseResult {
  rows: string[][];
  issues: CsvIssue[];
  /** True when parsing could not complete (e.g. unterminated quote). Rows must not be imported. */
  fatal: boolean;
}

export const DELIMITERS: { label: string; value: string }[] = [
  { label: 'Comma (,)', value: ',' },
  { label: 'Semicolon (;)', value: ';' },
  { label: 'Tab', value: '\t' },
  { label: 'Pipe (|)', value: '|' },
];

/** RFC-4180 style parser: quoted fields, delimiters/newlines inside quotes, "" escapes, CRLF/LF/CR, BOM. */
export function parseCsv(text: string, delimiter = ','): CsvParseResult {
  const issues: CsvIssue[] = [];
  const rows: string[][] = [];
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false; // closing quote seen, awaiting delimiter/newline
  let fieldStarted = false;
  let line = 1;
  let quoteLine = 1;

  const endField = () => {
    row.push(field);
    field = '';
    fieldStarted = false;
    afterQuote = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === delimiter) {
      endField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
    } else if (ch === '"') {
      if (!fieldStarted && field === '') {
        inQuotes = true;
        quoteLine = line;
        fieldStarted = true;
      } else if (afterQuote) {
        issues.push({ severity: 'warning', line, message: 'Unexpected quote after a closing quote; kept literally.' });
        field += ch;
      } else {
        issues.push({ severity: 'warning', line, message: 'Quote inside an unquoted field; kept literally.' });
        field += ch;
      }
    } else {
      if (afterQuote) issues.push({ severity: 'warning', line, message: 'Text after a closing quote; kept literally.' });
      field += ch;
      fieldStarted = true;
    }
  }
  if (inQuotes) {
    issues.push({ severity: 'error', line: quoteLine, message: `Unterminated quoted field starting on line ${quoteLine}.` });
    return { rows: [], issues, fatal: true };
  }
  if (fieldStarted || field !== '' || row.length > 0) endRow();

  // Ragged rows: reported, never truncated.
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  rows.forEach((r, idx) => {
    if (r.length !== width && !(r.length === 1 && r[0] === ''))
      issues.push({ severity: 'warning', line: idx + 1, message: `Row ${idx + 1} has ${r.length} fields; widest row has ${width}. Short rows are padded with empty cells.` });
  });
  // Drop fully blank lines but report them.
  const kept = rows.filter((r, idx) => {
    const blank = r.length === 1 && r[0] === '';
    if (blank) issues.push({ severity: 'warning', line: idx + 1, message: `Blank line ${idx + 1} ignored.` });
    return !blank;
  });
  return { rows: kept, issues, fatal: false };
}

/** Pick the delimiter that yields the most consistent column count (>1) over the first lines. */
export function detectDelimiter(text: string): string {
  let best = ',';
  let bestScore = -1;
  for (const d of [',', ';', '\t', '|']) {
    const res = parseCsv(text.split(/\r?\n/).slice(0, 20).join('\n'), d);
    if (res.fatal || res.rows.length === 0) continue;
    const widths = res.rows.map((r) => r.length);
    const w = widths[0];
    if (w < 2) continue;
    const consistent = widths.filter((x) => x === w).length / widths.length;
    const score = consistent * 100 + w;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export interface CsvImportOptions {
  hasHeader: boolean;
  /** For each ImpEx column index: CSV column index or -1 for "leave empty". */
  mapping: number[];
  mode: 'append' | 'replace';
}

export const csvWidth = (rows: string[][]): number => rows.reduce((m, r) => Math.max(m, r.length), 0);

/** Suggest a mapping by header name (case-insensitive, ignoring reference expressions) else by position. */
export function autoMap(config: ImpexConfig, header: string[] | null, width: number): number[] {
  const norm = (s: string) => s.trim().toLowerCase();
  return config.columns.map((c, i) => {
    if (header) {
      const base = norm(c.attribute.replace(/[([].*$/, ''));
      const k = header.findIndex((h) => norm(h) === base || norm(h) === norm(c.attribute));
      if (k >= 0) return k;
      return -1;
    }
    return i < width ? i : -1;
  });
}

/** Pure: returns the new rows for the config. Does not mutate. */
export function applyCsvImport(config: ImpexConfig, parsed: string[][], opts: CsvImportOptions): ImpexConfig {
  const body = opts.hasHeader ? parsed.slice(1) : parsed;
  const imported = body.map((r) => config.columns.map((_, i) => (opts.mapping[i] >= 0 ? (r[opts.mapping[i]] ?? '') : '')));
  return { ...config, rows: opts.mode === 'replace' ? imported : [...config.rows, ...imported] };
}

/** CSV columns not mapped to any ImpEx column (surfaced in the preview so nothing is dropped silently). */
export const unmappedCsvColumns = (width: number, mapping: number[]): number[] =>
  Array.from({ length: width }, (_, i) => i).filter((i) => !mapping.includes(i));
