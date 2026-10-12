import { useMemo, useState } from 'react';
import { CodeView } from '../../shared/CodeView';
import { ConfigManager } from '../../shared/ConfigManager';
import { DiagnosticsPanel, DiagnosticSummary } from '../../shared/DiagnosticsPanel';
import { hasErrors } from '../../shared/diagnostics';
import { copyText, downloadBlob, downloadText, safeFileName } from '../../shared/files';
import { IconCopy, IconDownload, IconFile, IconFolder, IconReset, IconUpload } from '../../shared/icons';
import { ConfirmDialog } from '../../shared/Modal';
import { Tabs } from '../../shared/Tabs';
import { useToast } from '../../shared/Toast';
import { useDraft } from '../../shared/useDraft';
import { EndpointEditor, EndpointPicker } from './EndpointEditor';
import { buildProjectZip } from './export';
import { generateFiles } from './generate';
import { ImportJavaDialog } from './ImportJavaDialog';
import { MockTester } from './MockTester';
import { baseName, defaultConfig, newEndpoint, OCC_SCHEMA, OCC_VERSION, parseOccConfig, PROFILES, type OccConfig } from './model';
import { validateOcc } from './validate';

type Tab = 'builder' | 'code' | 'mock';

const parseSource = (v: unknown) => (typeof v === 'string' ? ({ ok: true, value: v } as const) : ({ ok: false, error: 'bad' } as const));

export default function OccPage() {
  const toast = useToast();
  const { state: config, setState: setConfig, reset, storageError } = useDraft<OccConfig>('occ', defaultConfig, parseOccConfig);
  const { state: source, setState: setSource } = useDraft<string>('occ-source', () => '', parseSource);
  const [tab, setTab] = useState<Tab>('builder');
  const [sel, setSel] = useState(0);
  const [fileSel, setFileSel] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [cfgOpen, setCfgOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [deleteEp, setDeleteEp] = useState(false);
  const [baseline, setBaseline] = useState(() => JSON.stringify(config));
  const [savedName, setSavedName] = useState('Untitled controller');

  const files = useMemo(() => generateFiles(config), [config]);
  const diagnostics = useMemo(() => validateOcc(config), [config]);
  const blocked = hasErrors(diagnostics);
  const dirty = JSON.stringify(config) !== baseline;
  const epIdx = Math.min(sel, Math.max(0, config.endpoints.length - 1));
  const entries = [...files.map((f) => ({ name: f.name, path: f.path, content: f.content, purpose: f.purpose })), ...(source ? [{ name: 'Imported source (original)', path: '', content: source, purpose: 'The Java text you imported, unchanged.' }] : [])];
  const current = entries[Math.min(fileSel, entries.length - 1)];
  const blockMsg = 'Fix the errors (Problems) before exporting generated files.';

  const set = (patch: Partial<OccConfig>) => setConfig({ ...config, ...patch });
  const setEp = (e: OccConfig['endpoints'][number]) => set({ endpoints: config.endpoints.map((x, i) => (i === epIdx ? e : x)) });

  // Keep derived class names in step with the controller name until the user edits them manually.
  const setController = (name: string) => {
    const oldBase = baseName(config.controllerName);
    const nb = baseName(name);
    const follow = (cur: string, derived: string) => (cur === derived ? derived.replace(oldBase, nb) : cur);
    set({
      controllerName: name,
      facade: { ...config.facade, interfaceName: follow(config.facade.interfaceName, `${oldBase}Facade`), implName: follow(config.facade.implName, `Default${oldBase}Facade`) },
      validator: { ...config.validator, className: follow(config.validator.className, `${oldBase}Validator`) },
    });
  };

  const downloadZip = () => {
    downloadBlob(`${safeFileName(config.controllerName)}-${config.profile}.zip`, new Blob([buildProjectZip(config, diagnostics) as BlobPart], { type: 'application/zip' }));
    toast('Downloaded ZIP with generated files and README');
  };

  return (
    <div className="tool">
      <div className="toolbar">
        <h1>OCC Controller Generator &amp; Tester</h1>
        <div className="segmented" role="group" aria-label="SAP Commerce profile">
          {PROFILES.map((p) => <button key={p} type="button" aria-pressed={config.profile === p} onClick={() => set({ profile: p })}>SAP Commerce {p}</button>)}
        </div>
        <span className="spacer" />
        <span className={`dot-unsaved${dirty ? ' dirty' : ''}`}>{dirty ? 'Unsaved changes' : `Saved: ${savedName}`}</span>
        <button type="button" className="btn" onClick={() => setImportOpen(true)}><IconUpload />Import Java</button>
        <button type="button" className="btn" onClick={() => setCfgOpen(true)}><IconFolder />Configurations</button>
        <button type="button" className="btn" onClick={() => setConfirmReset(true)}><IconReset />Reset</button>
      </div>
      {storageError && <p className="banner banner-warning" role="alert">{storageError} Work is kept in memory while this tab is open – export a JSON backup.</p>}

      <Tabs idPrefix="oc" label="OCC workspace" value={tab} onChange={setTab} tabs={[
        { id: 'builder', label: 'Builder' },
        { id: 'code', label: `Generated Code (${files.length})` },
        { id: 'mock', label: 'Mock Test' },
      ]} />

      <div className="panel-enter" key={tab} role="tabpanel" id={`oc-panel-${tab}`} aria-labelledby={`oc-tab-${tab}`} style={{ marginTop: 12 }}>
        {tab === 'builder' && (
          <div className="workspace">
            <div className="stack">
              <details className="sect" open>
                <summary>Controller</summary>
                <div className="sect-body">
                  <div className="grid-2">
                    <label className="field"><span>Java package</span><input className="mono" value={config.packageName} spellCheck={false} onChange={(e) => set({ packageName: e.target.value })} /></label>
                    <label className="field"><span>Controller class name</span><input className="mono" value={config.controllerName} spellCheck={false} onChange={(e) => setController(e.target.value)} /></label>
                    <label className="field"><span>Base request path</span><input className="mono" value={config.basePath} spellCheck={false} onChange={(e) => set({ basePath: e.target.value })} /></label>
                    <label className="field"><span>Controller annotation</span>
                      <select value={config.classAnnotation} onChange={(e) => set({ classAnnotation: e.target.value as OccConfig['classAnnotation'] })}><option value="Controller">@Controller (+ @ResponseBody)</option><option value="RestController">@RestController</option></select>
                    </label>
                    <label className="field"><span>Mapping annotations</span>
                      <select value={config.mappingStyle} onChange={(e) => set({ mappingStyle: e.target.value as OccConfig['mappingStyle'] })}><option value="RequestMapping">@RequestMapping(method = …)</option><option value="Shortcut">@GetMapping / @PostMapping / …</option></select>
                    </label>
                    <label className="field"><span>API group / tag</span><input value={config.apiTag} onChange={(e) => set({ apiTag: e.target.value })} /></label>
                  </div>
                  <label className="field"><span>Extra class annotations (one per line, written as typed – no imports generated)</span>
                    <textarea className="mono" rows={2} spellCheck={false} value={config.extraClassAnnotations.join('\n')} onChange={(e) => set({ extraClassAnnotations: e.target.value.split('\n').filter((l) => l.trim() !== '') })} placeholder="@Deprecated" />
                  </label>
                </div>
              </details>
              <details className="sect" open>
                <summary>Endpoints ({config.endpoints.length})</summary>
                <div className="sect-body">
                  <EndpointPicker config={config} sel={epIdx} onSelect={setSel}
                    onAdd={() => { set({ endpoints: [...config.endpoints, newEndpoint(config.endpoints.length + 1)] }); setSel(config.endpoints.length); }}
                    onDuplicate={() => { const e = structuredClone(config.endpoints[epIdx]); e.methodName += 'Copy'; set({ endpoints: [...config.endpoints, e] }); setSel(config.endpoints.length); }}
                    onDelete={() => setDeleteEp(true)} />
                  {config.endpoints.length === 0 ? <p className="empty">No endpoints. Add one to generate a controller method.</p> : <EndpointEditor config={config} index={epIdx} onChange={setEp} />}
                </div>
              </details>
              <details className="sect">
                <summary>Request / supporting DTO</summary>
                <div className="sect-body">
                  <label className="check"><input type="checkbox" checked={config.dto.enabled} onChange={(e) => set({ dto: { ...config.dto, enabled: e.target.checked } })} />Generate a WsDTO class</label>
                  {config.dto.enabled && (
                    <>
                      <div className="grid-2">
                        <label className="field"><span>Package</span><input className="mono" value={config.dto.packageName} spellCheck={false} onChange={(e) => set({ dto: { ...config.dto, packageName: e.target.value } })} /></label>
                        <label className="field"><span>Class name</span><input className="mono" value={config.dto.className} spellCheck={false} onChange={(e) => set({ dto: { ...config.dto, className: e.target.value } })} /></label>
                      </div>
                      <label className="field"><span>Description</span><input value={config.dto.description} onChange={(e) => set({ dto: { ...config.dto, description: e.target.value } })} /></label>
                      <div className="field-label">Fields</div>
                      {config.dto.fields.map((f, i) => (
                        <div className="item-row" key={i} role="group" aria-label={`DTO field ${i + 1}`} style={{ flexWrap: 'wrap' }}>
                          <input className="mono" style={{ flex: '1 1 110px' }} aria-label={`DTO field ${i + 1} name`} placeholder="name" value={f.name} spellCheck={false} onChange={(e) => set({ dto: { ...config.dto, fields: config.dto.fields.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) } })} />
                          <input className="mono" style={{ flex: '1 1 110px' }} list="java-types" aria-label={`DTO field ${i + 1} type`} placeholder="type" value={f.javaType} spellCheck={false} onChange={(e) => set({ dto: { ...config.dto, fields: config.dto.fields.map((x, k) => (k === i ? { ...x, javaType: e.target.value } : x)) } })} />
                          <input style={{ flex: '2 1 150px' }} aria-label={`DTO field ${i + 1} description`} placeholder="description" value={f.description} onChange={(e) => set({ dto: { ...config.dto, fields: config.dto.fields.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)) } })} />
                          <label className="check"><input type="checkbox" checked={f.required} onChange={(e) => set({ dto: { ...config.dto, fields: config.dto.fields.map((x, k) => (k === i ? { ...x, required: e.target.checked } : x)) } })} />required</label>
                          <button type="button" className="btn btn-sm btn-danger-ghost" aria-label={`Remove DTO field ${i + 1}`} onClick={() => set({ dto: { ...config.dto, fields: config.dto.fields.filter((_, k) => k !== i) } })}>Remove</button>
                        </div>
                      ))}
                      <div><button type="button" className="btn btn-sm" onClick={() => set({ dto: { ...config.dto, fields: [...config.dto.fields, { name: '', javaType: 'String', description: '', required: false }] } })}>Add field</button></div>
                    </>
                  )}
                </div>
              </details>
              <details className="sect">
                <summary>Facade &amp; validator skeletons</summary>
                <div className="sect-body">
                  <label className="check"><input type="checkbox" checked={config.facade.enabled} onChange={(e) => set({ facade: { ...config.facade, enabled: e.target.checked } })} />Generate facade interface + implementation</label>
                  {config.facade.enabled && (
                    <div className="grid-3">
                      <label className="field"><span>Package</span><input className="mono" value={config.facade.packageName} spellCheck={false} onChange={(e) => set({ facade: { ...config.facade, packageName: e.target.value } })} /></label>
                      <label className="field"><span>Interface</span><input className="mono" value={config.facade.interfaceName} spellCheck={false} onChange={(e) => set({ facade: { ...config.facade, interfaceName: e.target.value } })} /></label>
                      <label className="field"><span>Implementation</span><input className="mono" value={config.facade.implName} spellCheck={false} onChange={(e) => set({ facade: { ...config.facade, implName: e.target.value } })} /></label>
                    </div>
                  )}
                  <label className="check"><input type="checkbox" checked={config.validator.enabled} onChange={(e) => set({ validator: { ...config.validator, enabled: e.target.checked } })} />Generate validator</label>
                  {config.validator.enabled && (
                    <div className="grid-2">
                      <label className="field"><span>Package</span><input className="mono" value={config.validator.packageName} spellCheck={false} onChange={(e) => set({ validator: { ...config.validator, packageName: e.target.value } })} /></label>
                      <label className="field"><span>Class name</span><input className="mono" value={config.validator.className} spellCheck={false} onChange={(e) => set({ validator: { ...config.validator, className: e.target.value } })} /></label>
                    </div>
                  )}
                  <p className="small muted">These are scaffolding with TODOs. No services, models or Spring wiring are invented.</p>
                </div>
              </details>
            </div>
            <div className="stack pane-sticky">
              <section className="pane" aria-label="Live preview">
                <div className="pane-head">
                  <h2>Live preview</h2>
                  <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <span className="sr-only">File</span>
                    <select aria-label="Preview file" value={Math.min(fileSel, files.length - 1)} onChange={(e) => setFileSel(Number(e.target.value))}>{files.map((f, i) => <option key={f.path} value={i}>{f.name}</option>)}</select>
                  </label>
                </div>
                <CodeView code={files[Math.min(fileSel, files.length - 1)].content} lang="java" label="Generated Java preview" maxHeight="46vh" />
              </section>
              <section className="pane"><DiagnosticsPanel diagnostics={diagnostics} emptyText="No problems." /></section>
            </div>
          </div>
        )}

        {tab === 'code' && (
          <div className="workspace workspace-files">
            <section className="pane" aria-label="Generated files">
              <div className="pane-head"><h2>Files</h2><DiagnosticSummary diagnostics={diagnostics} /></div>
              <ul className="diag-list" style={{ maxHeight: 'none' }} aria-label="Generated files">
                {entries.map((f, i) => (
                  <li key={f.name} style={{ borderBottom: '1px solid var(--border)' }}>
                    <button type="button" className="btn" style={{ width: '100%', justifyContent: 'flex-start', border: 0, borderRadius: 0, background: i === Math.min(fileSel, entries.length - 1) ? 'var(--accent-weak)' : 'transparent', height: 'auto', padding: '8px 12px', flexDirection: 'column', alignItems: 'flex-start', gap: 0, whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setFileSel(i)} aria-current={i === fileSel}>
                      <span><IconFile /> {f.name}</span>
                      <span className="small muted" style={{ fontWeight: 400 }}>{f.purpose}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="pad stack">
                <button type="button" className="btn btn-primary" disabled={blocked} title={blocked ? blockMsg : 'Download ZIP'} onClick={downloadZip}><IconDownload />Download ZIP + README</button>
                {blocked && <p className="banner banner-error" style={{ margin: 0 }} role="status">{blockMsg} Individual file copy/download remains available for inspection.</p>}
                <p className="small muted">ZIP contains {files.length} Java file{files.length === 1 ? '' : 's'} under <code>src/…</code> and a README with assumptions, TODOs and manual checks.</p>
              </div>
            </section>
            <div className="stack">
              <section className="pane" aria-label="File content">
                <div className="pane-head">
                  <h2>{current.name}</h2>
                  <div className="code-actions">
                    <button type="button" className="btn btn-sm" onClick={async () => toast((await copyText(current.content)) ? 'Copied to clipboard' : 'Copy failed – select the text manually', 'success')}><IconCopy />Copy</button>
                    {current.path && <button type="button" className="btn btn-sm" onClick={() => { downloadText(current.name, current.content, 'text/x-java-source;charset=utf-8'); toast(`Downloaded ${current.name}`); }}><IconDownload />Download .java</button>}
                  </div>
                </div>
                <CodeView code={current.content} lang="java" label={`Source of ${current.name}`} maxHeight="64vh" />
              </section>
              <section className="pane"><DiagnosticsPanel diagnostics={diagnostics} emptyText="No problems." /></section>
            </div>
          </div>
        )}

        {tab === 'mock' && <MockTester config={config} setConfig={setConfig} />}
      </div>

      <ImportJavaDialog open={importOpen} onClose={() => setImportOpen(false)} source={source} onSource={setSource} onApply={(c) => { setConfig(c); setSel(0); setFileSel(0); }} />
      <ConfigManager<OccConfig> open={cfgOpen} onClose={() => setCfgOpen(false)} tool="occ" schema={OCC_SCHEMA} version={OCC_VERSION} current={config} parse={parseOccConfig} defaultName={savedName}
        onLoad={(c, name) => { setConfig(c); setBaseline(JSON.stringify(c)); setSavedName(name); setSel(0); setFileSel(0); }} />
      <ConfirmDialog open={confirmReset} title="Reset OCC workspace?" message="This discards the current controller configuration and restores the default example. Saved configurations and imported source are not affected." confirmLabel="Reset" danger onCancel={() => setConfirmReset(false)} onConfirm={() => { reset(); setSel(0); setFileSel(0); setConfirmReset(false); toast('Workspace reset'); }} />
      <ConfirmDialog open={deleteEp} title="Delete endpoint?" message={<>Delete <strong>{config.endpoints[epIdx]?.methodName}</strong> and its parameters?</>} confirmLabel="Delete" danger onCancel={() => setDeleteEp(false)} onConfirm={() => { set({ endpoints: config.endpoints.filter((_, i) => i !== epIdx) }); setSel(Math.max(0, epIdx - 1)); setDeleteEp(false); }} />
    </div>
  );
}
