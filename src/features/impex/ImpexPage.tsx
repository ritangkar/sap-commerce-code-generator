import { Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { CodeView } from '../../shared/CodeView';
import { DiagnosticsPanel, DiagnosticSummary } from '../../shared/DiagnosticsPanel';
import { ConfigManager } from '../../shared/ConfigManager';
import { hasErrors } from '../../shared/diagnostics';
import { copyText, downloadText, safeFileName } from '../../shared/files';
import { IconCopy, IconDownload, IconFolder, IconReset } from '../../shared/icons';
import { ConfirmDialog } from '../../shared/Modal';
import { Tabs } from '../../shared/Tabs';
import { useToast } from '../../shared/Toast';
import { useDraft } from '../../shared/useDraft';
import { CsvImportDialog } from './CsvImportDialog';
import { DataGrid } from './DataGrid';
import { HeaderEditor } from './HeaderEditor';
import { MacroEditor } from './MacroEditor';
import { defaultConfig, IMPEX_MODES, IMPEX_SCHEMA, IMPEX_VERSION, parseImpexConfig, type ImpexConfig, type ImpexMode } from './model';
import { serializeImpex } from './serializer';
import { TEMPLATES } from './templates';
import { expandMacros, macroDefs, validateImpex } from './validate';

type EditTab = 'header' | 'macros' | 'data';
type OutTab = 'script' | 'problems' | 'expanded';

export default function ImpexPage() {
  const toast = useToast();
  const { state: config, setState: setConfig, reset, storageError } = useDraft<ImpexConfig>('impex', defaultConfig, parseImpexConfig);
  const [tab, setTab] = useState<EditTab>('header');
  const [outTab, setOutTab] = useState<OutTab>('script');
  const [csvOpen, setCsvOpen] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(() => JSON.stringify(config));
  const [savedName, setSavedName] = useState('Untitled ImpEx');
  const [mark, setMark] = useState<number[]>([]);
  const outRef = useRef<HTMLDivElement>(null);

  const out = useMemo(() => serializeImpex(config), [config]);
  const diagnostics = useMemo(() => validateImpex(config), [config]);
  const blocked = hasErrors(diagnostics);
  const dirty = JSON.stringify(config) !== baseline;
  const expanded = useMemo(() => {
    const defs = macroDefs(config);
    return config.macros.map((m) => ({ name: m.name, value: expandMacros(m.value, defs) }));
  }, [config]);

  const fileName = `${safeFileName(config.type || 'script')}.impex`;
  const blockMsg = 'Fix the errors in the Problems tab before copying or downloading.';

  const onSelectLine = useCallback((line: number) => {
    setOutTab('script');
    setMark([line]);
    setTimeout(() => outRef.current?.querySelector('.cl-mark')?.scrollIntoView({ block: 'center' }), 0);
  }, []);

  const applyTemplate = (id: string) => {
    const t = TEMPLATES.find((x) => x.id === id);
    if (t) { setConfig(structuredClone(t.config)); toast(`Loaded ${t.label} example (unverified against your system).`, 'info'); }
  };

  return (
    <div className="tool">
      <div className="toolbar">
        <h1>ImpEx Generator</h1>
        <div className="segmented" role="group" aria-label="Import mode">
          {IMPEX_MODES.map((m) => (
            <button key={m} type="button" aria-pressed={config.mode === m} onClick={() => setConfig({ ...config, mode: m as ImpexMode })}>{m}</button>
          ))}
        </div>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span>Type</span>
          <input className="mono" style={{ width: 170 }} list="impex-types" value={config.type} spellCheck={false} onChange={(e) => setConfig({ ...config, type: e.target.value })} aria-label="Item type" placeholder="Product" />
          <datalist id="impex-types">{['Product', 'Category', 'CatalogVersion', 'Media', 'Customer', 'Title', 'Language'].map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <span>Example</span>
          <select value="" aria-label="Start from an example" onChange={(e) => e.target.value && setPendingTemplate(e.target.value)}>
            <option value="">Start from…</option>
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <span className="spacer" />
        <span className={`dot-unsaved${dirty ? ' dirty' : ''}`}>{dirty ? 'Unsaved changes' : `Saved: ${savedName}`}</span>
        <button type="button" className="btn" onClick={() => setCfgOpen(true)}><IconFolder />Configurations</button>
        <button type="button" className="btn" onClick={() => setConfirmReset(true)}><IconReset />Reset</button>
      </div>

      {config.mode === 'REMOVE' && (
        <p className="banner banner-warning" role="alert"><strong>REMOVE is destructive.</strong> Importing this script deletes matching items. This tool never executes ImpEx – review the script and run it only where you intend to.</p>
      )}
      {storageError && <p className="banner banner-warning" role="alert">{storageError} Work is kept in memory while this tab is open – export a JSON backup.</p>}

      <div className="workspace">
        <section className="pane" aria-label="Editor">
          <div className="pane-head" style={{ padding: 0, paddingRight: 8 }}>
            <Tabs idPrefix="ie" label="Editor sections" value={tab} onChange={setTab} tabs={[
              { id: 'header', label: `Header (${config.columns.length})` },
              { id: 'macros', label: `Macros (${config.macros.length})` },
              { id: 'data', label: `Data (${config.rows.length})` },
            ]} />
          </div>
          <div className="pane-body panel-enter" key={tab} role="tabpanel" id={`ie-panel-${tab}`} aria-labelledby={`ie-tab-${tab}`}>
            {tab === 'header' && (
              <div className="stack">
                <label className="field">
                  <span>Type modifiers (optional, raw)</span>
                  <input className="mono" value={config.typeModifiers} spellCheck={false} onChange={(e) => setConfig({ ...config, typeModifiers: e.target.value })} placeholder="batchmode=true" />
                </label>
                <label className="field">
                  <span>Leading comment (optional)</span>
                  <input value={config.comment} onChange={(e) => setConfig({ ...config, comment: e.target.value.replace(/\n/g, ' ') })} placeholder="What this script does" />
                </label>
                <HeaderEditor config={config} onChange={setConfig} />
              </div>
            )}
            {tab === 'macros' && <MacroEditor config={config} onChange={setConfig} />}
            {tab === 'data' && <DataGrid config={config} onChange={setConfig} diagnostics={diagnostics} onImport={() => setCsvOpen(true)} />}
          </div>
        </section>

        <section className="pane pane-sticky" aria-label="Output">
          <div className="pane-head" style={{ padding: 0, paddingRight: 8 }}>
            <Tabs idPrefix="io" label="Output views" value={outTab} onChange={setOutTab} tabs={[
              { id: 'script', label: 'ImpEx' },
              { id: 'problems', label: <>Problems <span className="tab-count"><DiagnosticSummary diagnostics={diagnostics} /></span></> },
              { id: 'expanded', label: 'Macro expansion' },
            ]} />
            <div className="code-actions">
              <button type="button" className="btn btn-sm" disabled={blocked} title={blocked ? blockMsg : 'Copy script'} onClick={async () => toast((await copyText(out.text)) ? 'Copied ImpEx to clipboard' : 'Copy failed – select the text manually', 'success')}><IconCopy />Copy</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={blocked} title={blocked ? blockMsg : `Download ${fileName}`} onClick={() => { downloadText(fileName, out.text); toast(`Downloaded ${fileName}`); }}><IconDownload />.impex</button>
            </div>
          </div>
          <div role="tabpanel" id={`io-panel-${outTab}`} aria-labelledby={`io-tab-${outTab}`} ref={outRef}>
            {blocked && outTab === 'script' && <p className="banner banner-error" style={{ margin: 8 }} role="status">{blockMsg} The preview below is still shown for inspection.</p>}
            {outTab === 'script' && <CodeView code={out.text} lang="impex" label="Generated ImpEx script" markLines={mark} />}
            {outTab === 'problems' && (
              <DiagnosticsPanel diagnostics={diagnostics} onSelectLine={onSelectLine} emptyText="No problems. Structural checks passed – type and attribute existence cannot be verified offline." />
            )}
            {outTab === 'expanded' && (
              <div className="pad">
                {expanded.length === 0 ? <p className="muted">No macros defined.</p> : (
                  <dl className="kv">{expanded.map((m, i) => <Fragment key={i}><dt>${m.name}</dt><dd>{m.value}</dd></Fragment>)}</dl>
                )}
                <p className="small muted" style={{ marginTop: 8 }}>Preview only – the generated script keeps your macro references.</p>
              </div>
            )}
          </div>
          <p className="small muted pad">Structural checks (syntax, macros, row/header alignment) are reliable. Checks about types, attributes, catalogs and languages are warnings only: this tool has no access to your system's metadata. No ImpEx is ever executed or sent anywhere.</p>
        </section>
      </div>

      <CsvImportDialog open={csvOpen} onClose={() => setCsvOpen(false)} config={config} onApply={setConfig} />
      <ConfigManager<ImpexConfig>
        open={cfgOpen}
        onClose={() => setCfgOpen(false)}
        tool="impex"
        schema={IMPEX_SCHEMA}
        version={IMPEX_VERSION}
        current={config}
        parse={parseImpexConfig}
        defaultName={savedName}
        onLoad={(c, name) => { setConfig(c); setBaseline(JSON.stringify(c)); setSavedName(name); }}
      />
      <ConfirmDialog open={confirmReset} title="Reset ImpEx workspace?" message="This discards the current header, macros and data and restores the default configuration. Saved configurations are not affected." confirmLabel="Reset" danger onCancel={() => setConfirmReset(false)} onConfirm={() => { reset(); setConfirmReset(false); toast('Workspace reset'); }} />
      <ConfirmDialog open={pendingTemplate !== null} title="Replace current configuration?" message="Starting from an example replaces everything you are editing. Save it first if you want to keep it." confirmLabel="Replace" danger onCancel={() => setPendingTemplate(null)} onConfirm={() => { if (pendingTemplate) applyTemplate(pendingTemplate); setPendingTemplate(null); }} />
    </div>
  );
}
