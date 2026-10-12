import { useRef, useState } from 'react';
import { CodeView } from '../../shared/CodeView';
import { readFileText } from '../../shared/files';
import { IconUpload } from '../../shared/icons';
import { ConfirmDialog, Modal } from '../../shared/Modal';
import { DiagnosticsPanel } from '../../shared/DiagnosticsPanel';
import { useToast } from '../../shared/Toast';
import { importJava, type ImportResult } from './importJava';
import type { OccConfig } from './model';

interface Props {
  open: boolean;
  onClose: () => void;
  source: string;
  onSource: (s: string) => void;
  onApply: (c: OccConfig) => void;
}

export function ImportJavaDialog({ open, onClose, source, onSource, onApply }: Props) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [confirm, setConfirm] = useState(false);

  const parse = () => {
    // The original text is kept as typed until the user clears it; it is never rewritten.
    onSource(draft);
    setResult(importJava(draft));
  };
  const current = result ?? (source ? importJava(source) : null);

  return (
    <>
      <Modal open={open} onClose={onClose} wide title="Import Java controller source"
        footer={<>
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" disabled={!current?.ok} onClick={() => setConfirm(true)}>Apply to builder…</button>
        </>}>
        <p className="small muted">Reads a small, explicit subset of Spring MVC controller syntax with a text scanner. Source is processed locally and never compiled, executed or uploaded. Your original text stays available until you clear it; the builder only changes when you apply.</p>
        <div className="row-gap">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}><IconUpload />Load .java file…</button>
          <input ref={fileRef} type="file" accept=".java,text/x-java-source,text/plain" hidden aria-label="Java file" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { try { const t = await readFileText(f); setDraft(t); setResult(null); } catch (err) { toast(`Could not read file: ${(err as Error).message}`, 'error'); } } }} />
          <button type="button" className="btn btn-primary" onClick={parse} disabled={!draft.trim()}>Parse</button>
          {source && <button type="button" className="btn btn-danger-ghost" onClick={() => { onSource(''); setResult(null); setDraft(''); }}>Clear imported source</button>}
        </div>
        <label className="field"><span>Paste Java source</span>
          <textarea className="mono" rows={9} value={draft} spellCheck={false} onChange={(e) => { setDraft(e.target.value); setResult(null); }} aria-label="Java source" placeholder="@Controller&#10;@RequestMapping(&quot;/{baseSiteId}/foo&quot;)&#10;public class FooController { … }" />
        </label>
        {current && (
          <div className="stack" style={{ marginTop: 12 }}>
            <div className={`banner ${current.ok ? 'banner-info' : 'banner-error'}`} role="status">
              {current.ok ? `Parsed ${current.config?.endpoints.length} endpoint(s) from ${current.config?.controllerName}. Review the findings below before applying.` : 'The source could not be converted. Your text is unchanged and the builder was not modified.'}
            </div>
            <div className="pane"><DiagnosticsPanel diagnostics={current.findings} emptyText="No findings." /></div>
            {source && <div className="pane"><div className="pane-head"><h3>Original source (preserved)</h3></div><CodeView code={source} lang="java" label="Imported original source" maxHeight="260px" /></div>}
          </div>
        )}
      </Modal>
      <ConfirmDialog open={confirm} title="Replace the builder configuration?" confirmLabel="Replace builder" danger onCancel={() => setConfirm(false)}
        message="Applying replaces controller settings and endpoints in the builder. DTO, facade and validator options are switched off because they cannot be imported. Method bodies are not preserved; your original source remains available in this dialog."
        onConfirm={() => { if (current?.config) { onApply(current.config); toast('Builder populated from imported source'); onClose(); } setConfirm(false); }} />
    </>
  );
}
