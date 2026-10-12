import type { StorageResult } from '../../shared/storage';

export const IMPEX_MODES = ['INSERT_UPDATE', 'INSERT', 'UPDATE', 'REMOVE'] as const;
export type ImpexMode = (typeof IMPEX_MODES)[number];

export interface ImpexColumn {
  /** Attribute qualifier or full expression, e.g. `catalogVersion(catalog(id),version)` or `$catalogVersion`. Never rewritten. */
  attribute: string;
  unique: boolean;
  lang: string;
  allowNull: boolean;
  defaultValue: string;
  /** Raw modifier text placed inside the brackets after structured modifiers, e.g. `virtual=true,translator=my.Translator`. */
  rawModifiers: string;
}

export interface ImpexMacro {
  /** Name without leading `$`. */
  name: string;
  value: string;
}

export interface ImpexConfig {
  mode: ImpexMode;
  type: string;
  /** Raw modifiers for the header type, e.g. `batchmode=true`. */
  typeModifiers: string;
  /** Optional leading comment; each line is emitted with a `# ` prefix. */
  comment: string;
  macros: ImpexMacro[];
  columns: ImpexColumn[];
  /** Cell matrix aligned to `columns`. Empty string = explicitly empty cell. */
  rows: string[][];
}

export const IMPEX_SCHEMA = 'sap-commerce-code-generator/impex-config';
export const IMPEX_VERSION = 1;

export const emptyColumn = (attribute = ''): ImpexColumn => ({
  attribute,
  unique: false,
  lang: '',
  allowNull: false,
  defaultValue: '',
  rawModifiers: '',
});

export const defaultConfig = (): ImpexConfig => ({
  mode: 'INSERT_UPDATE',
  type: 'Product',
  typeModifiers: '',
  comment: '',
  macros: [],
  columns: [{ ...emptyColumn('code'), unique: true }, { ...emptyColumn('name'), lang: 'en' }],
  rows: [['P-1000', 'Sample product']],
});

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const bool = (v: unknown): boolean => v === true;

/** Validate and normalise untrusted JSON into an ImpexConfig. Never throws. */
export function parseImpexConfig(input: unknown): StorageResult<ImpexConfig> {
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'Configuration must be an object.' };
  const o = input as Record<string, unknown>;
  if (!IMPEX_MODES.includes(o.mode as ImpexMode)) return { ok: false, error: `Unsupported import mode: ${String(o.mode)}.` };
  if (!Array.isArray(o.columns) || !Array.isArray(o.rows) || !Array.isArray(o.macros))
    return { ok: false, error: 'Configuration must contain "macros", "columns" and "rows" arrays.' };
  const columns: ImpexColumn[] = [];
  for (const [i, c] of o.columns.entries()) {
    if (typeof c !== 'object' || c === null) return { ok: false, error: `columns[${i}] must be an object.` };
    const r = c as Record<string, unknown>;
    columns.push({
      attribute: str(r.attribute),
      unique: bool(r.unique),
      lang: str(r.lang),
      allowNull: bool(r.allowNull),
      defaultValue: str(r.defaultValue),
      rawModifiers: str(r.rawModifiers),
    });
  }
  const macros: ImpexMacro[] = [];
  for (const [i, m] of o.macros.entries()) {
    if (typeof m !== 'object' || m === null) return { ok: false, error: `macros[${i}] must be an object.` };
    const r = m as Record<string, unknown>;
    macros.push({ name: str(r.name), value: str(r.value) });
  }
  const rows: string[][] = [];
  for (const [i, row] of o.rows.entries()) {
    if (!Array.isArray(row) || row.some((c) => typeof c !== 'string'))
      return { ok: false, error: `rows[${i}] must be an array of strings.` };
    rows.push(row as string[]);
  }
  return {
    ok: true,
    value: { mode: o.mode as ImpexMode, type: str(o.type), typeModifiers: str(o.typeModifiers), comment: str(o.comment), macros, columns, rows },
  };
}

// ---- Pure editing operations (preserve data where mapping is unambiguous) ----

export const addRow = (c: ImpexConfig, at = c.rows.length): ImpexConfig => {
  const rows = [...c.rows];
  rows.splice(at, 0, c.columns.map(() => ''));
  return { ...c, rows };
};

export const duplicateRow = (c: ImpexConfig, i: number): ImpexConfig => {
  const rows = [...c.rows];
  rows.splice(i + 1, 0, [...c.rows[i]]);
  return { ...c, rows };
};

export const deleteRow = (c: ImpexConfig, i: number): ImpexConfig => ({ ...c, rows: c.rows.filter((_, k) => k !== i) });

export const moveItem = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length || from === to) return list;
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
};

export const moveRow = (c: ImpexConfig, from: number, to: number): ImpexConfig => ({ ...c, rows: moveItem(c.rows, from, to) });

export const setCell = (c: ImpexConfig, r: number, col: number, v: string): ImpexConfig => ({
  ...c,
  rows: c.rows.map((row, i) => (i === r ? row.map((x, j) => (j === col ? v : x)) : row)),
});

export const addColumn = (c: ImpexConfig, col: ImpexColumn, at = c.columns.length): ImpexConfig => {
  const columns = [...c.columns];
  columns.splice(at, 0, col);
  return { ...c, columns, rows: c.rows.map((r) => { const n = [...r]; n.splice(at, 0, ''); return n; }) };
};

/** Number of non-empty cells that would be discarded by removing column `i`. */
export const discardedCells = (c: ImpexConfig, i: number): number => c.rows.filter((r) => (r[i] ?? '') !== '').length;

export const removeColumn = (c: ImpexConfig, i: number): ImpexConfig => ({
  ...c,
  columns: c.columns.filter((_, k) => k !== i),
  rows: c.rows.map((r) => r.filter((_, k) => k !== i)),
});

export const moveColumn = (c: ImpexConfig, from: number, to: number): ImpexConfig => {
  if (to < 0 || to >= c.columns.length || from === to) return c;
  return { ...c, columns: moveItem(c.columns, from, to), rows: c.rows.map((r) => moveItem(r, from, to)) };
};

export const updateColumn = (c: ImpexConfig, i: number, patch: Partial<ImpexColumn>): ImpexConfig => ({
  ...c,
  columns: c.columns.map((x, k) => (k === i ? { ...x, ...patch } : x)),
});

/**
 * Paste a matrix of cells starting at (r, col). Rows are appended as needed.
 * Columns beyond the header are NOT silently dropped: the count is returned so the UI can report it.
 */
export function pasteMatrix(c: ImpexConfig, r: number, col: number, m: string[][]): { config: ImpexConfig; droppedColumns: number } {
  const rows = c.rows.map((x) => [...x]);
  let dropped = 0;
  m.forEach((line, di) => {
    while (rows.length <= r + di) rows.push(c.columns.map(() => ''));
    line.forEach((v, dj) => {
      if (col + dj < c.columns.length) rows[r + di][col + dj] = v;
      else dropped = Math.max(dropped, col + dj - c.columns.length + 1);
    });
  });
  return { config: { ...c, rows }, droppedColumns: dropped };
}

export const isBlankRow = (row: string[]): boolean => row.every((c) => c === '');
