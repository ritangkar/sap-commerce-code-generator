export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  /** Optional explanation of implications or how to fix. */
  hint?: string;
  /** Logical location in the configuration, e.g. "columns[2]". */
  path?: string;
  /** 1-based line in generated output, when known. */
  line?: number;
}

export const hasErrors = (d: Diagnostic[]): boolean => d.some((x) => x.severity === 'error');

export const countBySeverity = (d: Diagnostic[]): Record<Severity, number> => ({
  error: d.filter((x) => x.severity === 'error').length,
  warning: d.filter((x) => x.severity === 'warning').length,
  info: d.filter((x) => x.severity === 'info').length,
});

const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
export const sortDiagnostics = (d: Diagnostic[]): Diagnostic[] =>
  [...d].sort((a, b) => order[a.severity] - order[b.severity]);
