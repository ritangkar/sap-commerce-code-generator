import { useMemo, useRef, useState } from 'react';
import type { Diagnostic } from '../../shared/diagnostics';
import { IconDown, IconDuplicate, IconPlus, IconTrash, IconUp } from '../../shared/icons';
import { useToast } from '../../shared/Toast';
import { parseCsv } from './csv';
import { addRow, deleteRow, duplicateRow, moveRow, pasteMatrix, setCell, type ImpexConfig } from './model';

const PAGE = 200;

interface Props {
  config: ImpexConfig;
  onChange: (c: ImpexConfig) => void;
  diagnostics: Diagnostic[];
  onImport: () => void;
}

export function DataGrid({ config, onChange, diagnostics, onImport }: Props) {
  const toast = useToast();
  const [page, setPage] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const pages = Math.max(1, Math.ceil(config.rows.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const start = cur * PAGE;
  const badRows = useMemo(() => new Set(diagnostics.filter((d) => d.severity === 'error' && d.path?.startsWith('rows[')).map((d) => Number(/rows\[(\d+)\]/.exec(d.path!)![1]))), [diagnostics]);

  const focusCell = (r: number, c: number) => {
    const el = wrap.current?.querySelector<HTMLTextAreaElement>(`[data-cell="${r}-${c}"]`);
    if (el) { el.focus(); el.select(); }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text.replace(/\n$/, ''))) return; // single value: normal paste
    const parsed = parseCsv(text.replace(/\r?\n$/, ''), '\t');
    if (parsed.fatal || parsed.rows.length === 0) return;
    e.preventDefault();
    const res = pasteMatrix(config, r, c, parsed.rows);
    onChange(res.config);
    toast(`Pasted ${parsed.rows.length} row${parsed.rows.length === 1 ? '' : 's'}${res.droppedColumns ? ` – ${res.droppedColumns} column${res.droppedColumns === 1 ? '' : 's'} beyond the header were not pasted` : ''}.`, res.droppedColumns ? 'info' : 'success');
  };

  if (config.columns.length === 0) return <p className="empty">Add columns in the Header tab first, then enter data here.</p>;

  return (
    <div className="stack">
      <div className="pill-row">
        <button type="button" className="btn" onClick={() => { onChange(addRow(config)); setPage(Math.floor(config.rows.length / PAGE)); }}><IconPlus />Add row</button>
        <button type="button" className="btn" onClick={onImport}>Import CSV / TSV…</button>
        <span className="muted small" aria-live="polite">{config.rows.length} row{config.rows.length === 1 ? '' : 's'} × {config.columns.length} column{config.columns.length === 1 ? '' : 's'} · Enter = next row, Shift+Enter = new line, paste tab-separated data into any cell</span>
      </div>
      {config.rows.length === 0 ? (
        <p className="empty">No data rows. Add a row, paste from a spreadsheet, or import a CSV file.</p>
      ) : (
        <div className="table-wrap" ref={wrap}>
          <table className="grid">
            <thead>
              <tr>
                <th className="rownum" scope="col">#</th>
                {config.columns.map((c, i) => (
                  <th key={i} scope="col" title={c.attribute}>
                    {c.attribute.length > 28 ? `${c.attribute.slice(0, 26)}…` : c.attribute || `column ${i + 1}`}
                    {c.unique && <span className="col-hint"> ·key</span>}
                  </th>
                ))}
                <th className="actions" scope="col"><span className="sr-only">Row actions</span></th>
              </tr>
            </thead>
            <tbody>
              {config.rows.slice(start, start + PAGE).map((row, k) => {
                const r = start + k;
                return (
                  <tr key={r}>
                    <th className="rownum" scope="row">{r + 1}</th>
                    {config.columns.map((_, c) => (
                      <td key={c} className={`cell${badRows.has(r) ? ' has-error' : ''}`}>
                        <textarea
                          data-cell={`${r}-${c}`}
                          rows={Math.max(1, (row[c] ?? '').split('\n').length)}
                          value={row[c] ?? ''}
                          spellCheck={false}
                          aria-label={`Row ${r + 1}, ${config.columns[c].attribute || `column ${c + 1}`}`}
                          onChange={(e) => onChange(setCell(config, r, c, e.target.value))}
                          onPaste={(e) => onPaste(e, r, c)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (r + 1 < config.rows.length) {
                                if (r + 1 >= start + PAGE) setPage(cur + 1);
                                setTimeout(() => focusCell(r + 1, c), 0);
                              }
                            }
                          }}
                        />
                      </td>
                    ))}
                    <td className="actions">
                      <button type="button" className="icon-btn" aria-label={`Move row ${r + 1} up`} disabled={r === 0} onClick={() => onChange(moveRow(config, r, r - 1))}><IconUp /></button>
                      <button type="button" className="icon-btn" aria-label={`Move row ${r + 1} down`} disabled={r === config.rows.length - 1} onClick={() => onChange(moveRow(config, r, r + 1))}><IconDown /></button>
                      <button type="button" className="icon-btn" aria-label={`Duplicate row ${r + 1}`} onClick={() => onChange(duplicateRow(config, r))}><IconDuplicate /></button>
                      <button type="button" className="icon-btn" aria-label={`Delete row ${r + 1}`} onClick={() => onChange(deleteRow(config, r))}><IconTrash /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="pill-row" role="navigation" aria-label="Row pages">
          <button type="button" className="btn btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous {PAGE}</button>
          <span className="small muted">Rows {start + 1}–{Math.min(start + PAGE, config.rows.length)} of {config.rows.length}</span>
          <button type="button" className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next {PAGE}</button>
        </div>
      )}
    </div>
  );
}
