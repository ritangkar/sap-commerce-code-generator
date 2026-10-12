import { countBySeverity, sortDiagnostics, type Diagnostic } from './diagnostics';
import { IconAlert, IconError, IconInfo } from './icons';

const icon = { error: <IconError />, warning: <IconAlert />, info: <IconInfo /> };
const label = { error: 'Error', warning: 'Warning', info: 'Information' };

export function DiagnosticSummary({ diagnostics }: { diagnostics: Diagnostic[] }) {
  const c = countBySeverity(diagnostics);
  return (
    <span className="diag-summary" aria-label={`${c.error} errors, ${c.warning} warnings, ${c.info} information`}>
      <span className={`dchip sev-error${c.error ? '' : ' zero'}`}><IconError />{c.error}</span>
      <span className={`dchip sev-warning${c.warning ? '' : ' zero'}`}><IconAlert />{c.warning}</span>
      <span className={`dchip sev-info${c.info ? '' : ' zero'}`}><IconInfo />{c.info}</span>
    </span>
  );
}

interface Props {
  diagnostics: Diagnostic[];
  onSelectLine?: (line: number) => void;
  emptyText?: string;
}

export function DiagnosticsPanel({ diagnostics, onSelectLine, emptyText = 'No problems found.' }: Props) {
  const sorted = sortDiagnostics(diagnostics);
  return (
    <section className="diagnostics" aria-label="Validation results">
      <div className="diag-head">
        <h3>Problems</h3>
        <DiagnosticSummary diagnostics={diagnostics} />
      </div>
      {sorted.length === 0 ? (
        <p className="muted pad">{emptyText}</p>
      ) : (
        <ul className="diag-list" tabIndex={0} aria-label="Validation messages">
          {sorted.map((d, i) => (
            <li key={`${d.code}-${d.path ?? ''}-${i}`} className={`diag sev-${d.severity}`}>
              <span className="diag-icon" title={label[d.severity]}>{icon[d.severity]}<span className="sr-only">{label[d.severity]}: </span></span>
              <div>
                <p>
                  {d.message}
                  {d.line && onSelectLine ? (
                    <button type="button" className="link-btn" onClick={() => onSelectLine(d.line!)}>line {d.line}</button>
                  ) : d.line ? (
                    <span className="muted"> · line {d.line}</span>
                  ) : null}
                </p>
                {d.hint && <p className="hint">{d.hint}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
