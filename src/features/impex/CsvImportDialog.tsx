import { useEffect, useMemo, useRef, useState } from 'react';
import { readFileText } from '../../shared/files';
import { IconUpload } from '../../shared/icons';
import { ConfirmDialog, Modal } from '../../shared/Modal';
import { useToast } from '../../shared/Toast';
import { applyCsvImport, autoMap, csvWidth, DELIMITERS, detectDelimiter, parseCsv, unmappedCsvColumns } from './csv';
import type { ImpexConfig } from './model';

interface Props {
  open: boolean;
  onClose: () => void;
  config: ImpexConfig;
  onApply: (c: ImpexConfig) => void;
}

export function CsvImportDialog({ open, onClose, config, onApply }: Props) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [delim, setDelim] = useState<string>('auto');
  const [hasHeader, setHasHeader] = useState(true);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [mapping, setMapping] = useState<number[]>([]);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const effectiveDelim = delim === 'auto' ? detectDelimiter(text) : delim;
  const parsed = useMemo(() => (text.trim() ? parseCsv(text, effectiveDelim) : null), [text, effectiveDelim]);
  const width = parsed ? csvWidth(parsed.rows) : 0;
  const header = parsed && hasHeader && parsed.rows.length ? parsed.rows[0] : null;

  useEffect(() => {
    if (open) { setText(''); setFileName(''); setDelim('auto'); setHasHeader(true); setMode('append'); setConfirmReplace(false); }
  }, [open]);
  useEffect(() => {
    if (parsed && !parsed.fatal) setMapping(autoMap(config, header, width));
    else setMapping([]);
    // mapping is recomputed whenever the parsed data or the header setting changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, hasHeader]);

  const loadFile = async (f: File) => {
    try {
      setText(await readFileText(f));
      setFileName(f.name);
    } catch (e) {
      toast(`Could not read file: ${(e as Error).message}`, 'error');
    }
  };

  const dataRows = parsed && !parsed.fatal ? parsed.rows.length - (hasHeader ? 1 : 0) : 0;
  const unmapped = parsed && !parsed.fatal ? unmappedCsvColumns(width, mapping) : [];
  const existing = config.rows.some((r) => r.some((c) => c !== ''));
  const canImport = !!parsed && !parsed.fatal && dataRows > 0 && config.columns.length > 0;

  const doImport = () => {
    if (!parsed) return;
    onApply(applyCsvImport(config, parsed.rows, { hasHeader, mapping, mode }));
    toast(`Imported ${dataRows} row${dataRows === 1 ? '' : 's'} (${mode}).`);
    onClose();
  };
  const colLabel = (i: number) => `#${i + 1}${header ? ` · ${header[i] || '(blank)'}` : ''}`;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        wide
        title="Import CSV / TSV"
        footer={
          <>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!canImport} onClick={() => (mode === 'replace' && existing ? setConfirmReplace(true) : doImport())}>
              {mode === 'replace' ? 'Replace data' : 'Append rows'}{canImport ? ` (${dataRows})` : ''}
            </button>
          </>
        }
      >
        <p className="small muted">Parsed locally in your browser; the file is never uploaded. Nothing changes until you press the import button.</p>
        <div className="row-gap">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}><IconUpload />Choose file…</button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" hidden aria-label="CSV file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadFile(f); }} />
          {fileName && <span className="small muted">{fileName}</span>}
          <label className="field">
            <span>Delimiter</span>
            <select value={delim} onChange={(e) => setDelim(e.target.value)} aria-label="Delimiter">
              <option value="auto">Auto-detect{text ? ` (${DELIMITERS.find((d) => d.value === effectiveDelim)?.label})` : ''}</option>
              {DELIMITERS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />First row is a header</label>
        </div>
        <label className="field">
          <span>…or paste CSV / TSV text</span>
          <textarea className="mono" rows={5} value={text} spellCheck={false} onChange={(e) => { setText(e.target.value); setFileName(''); }} aria-label="CSV text" placeholder={'code,name\nP-1,"Camera, compact"'} />
        </label>

        {parsed?.fatal && <p className="banner banner-error" role="alert">{parsed.issues.map((i) => i.message).join(' ')} Fix the file and try again – your current data is untouched.</p>}
        {parsed && !parsed.fatal && (
          <div className="stack" style={{ marginTop: 12 }}>
            <p><strong>{parsed.rows.length}</strong> record{parsed.rows.length === 1 ? '' : 's'}, <strong>{width}</strong> column{width === 1 ? '' : 's'}{hasHeader ? ` · ${dataRows} data row${dataRows === 1 ? '' : 's'}` : ''}.</p>
            {parsed.issues.length > 0 && (
              <ul className="small" aria-label="CSV warnings">{parsed.issues.slice(0, 8).map((i, k) => <li key={k} className={i.severity === 'error' ? 'banner-error' : ''}>Line {i.line}: {i.message}</li>)}{parsed.issues.length > 8 && <li>…and {parsed.issues.length - 8} more.</li>}</ul>
            )}
            <div className="table-wrap" style={{ maxHeight: 190 }} tabIndex={0} aria-label="Preview">
              <table className="grid">
                <thead><tr><th className="rownum">#</th>{Array.from({ length: width }, (_, i) => <th key={i}>{colLabel(i)}</th>)}</tr></thead>
                <tbody>
                  {parsed.rows.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + 6).map((r, k) => (
                    <tr key={k}><th className="rownum" scope="row">{k + 1}</th>{Array.from({ length: width }, (_, i) => <td key={i} style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'pre-wrap' }}>{r[i] ?? ''}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <fieldset style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
              <legend className="field-label">Column mapping (ImpEx column ← CSV column)</legend>
              <div className="grid-2">
                {config.columns.map((c, i) => (
                  <label className="field" key={i}>
                    <span className="mono">{c.attribute || `column ${i + 1}`}</span>
                    <select value={mapping[i] ?? -1} onChange={(e) => setMapping(mapping.map((m, k) => (k === i ? Number(e.target.value) : m)))} aria-label={`CSV column for ${c.attribute || `column ${i + 1}`}`}>
                      <option value={-1}>— leave empty —</option>
                      {Array.from({ length: width }, (_, k) => <option key={k} value={k}>{colLabel(k)}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {unmapped.length > 0 && <p className="banner banner-warning">CSV column{unmapped.length > 1 ? 's' : ''} not imported: {unmapped.map((i) => colLabel(i)).join(', ')}.</p>}
              <p className="small muted">CSV headers are not assumed to be valid attribute names – check the mapping.</p>
            </fieldset>
            <div className="pill-row" role="radiogroup" aria-label="Import mode">
              <label className="check"><input type="radio" name="csvmode" checked={mode === 'append'} onChange={() => setMode('append')} />Append to existing rows</label>
              <label className="check"><input type="radio" name="csvmode" checked={mode === 'replace'} onChange={() => setMode('replace')} />Replace all rows</label>
            </div>
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmReplace}
        title="Replace existing data?"
        message={<>This replaces all <strong>{config.rows.length}</strong> current rows with <strong>{dataRows}</strong> imported rows. You can save the configuration first to keep a copy.</>}
        confirmLabel="Replace rows"
        danger
        onCancel={() => setConfirmReplace(false)}
        onConfirm={() => { setConfirmReplace(false); doImport(); }}
      />
    </>
  );
}
