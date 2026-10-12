import { IconDuplicate, IconPlus, IconTrash } from '../../shared/icons';
import { ListInput } from './KvEditor';
import { TYPE_CATALOGUE } from './javaTypes';
import { fullPath, HTTP_METHODS, newParam, type OccConfig, type OccEndpoint, type OccParam, type ParamKind } from './model';
import { placeholders } from './validate';


const toJavaName = (s: string) => s.replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : '')).replace(/^[A-Z]/, (c) => c.toLowerCase());

interface Props {
  config: OccConfig;
  index: number;
  onChange: (e: OccEndpoint) => void;
}

export function EndpointEditor({ config, index, onChange }: Props) {
  const e = config.endpoints[index];
  const set = (patch: Partial<OccEndpoint>) => onChange({ ...e, ...patch });
  const setParam = (i: number, patch: Partial<OccParam>) => set({ params: e.params.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const missing = placeholders(fullPath(config, e)).filter((p) => p !== 'baseSiteId' && !e.params.some((x) => x.kind === 'path' && x.name === p));

  return (
    <div className="stack">
      <div className="grid-3">
        <label className="field"><span>Method name</span><input className="mono" value={e.methodName} onChange={(ev) => set({ methodName: ev.target.value })} spellCheck={false} /></label>
        <label className="field"><span>HTTP method</span>
          <select value={e.httpMethod} onChange={(ev) => set({ httpMethod: ev.target.value as OccEndpoint['httpMethod'] })}>{HTTP_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
        </label>
        <label className="field"><span>Endpoint path</span><input className="mono" value={e.path} onChange={(ev) => set({ path: ev.target.value })} placeholder="/{code}" spellCheck={false} /></label>
      </div>
      <p className="small muted">Full path: <code>{fullPath(config, e) || '/'}</code></p>
      <div className="grid-2">
        <label className="field"><span>Request content type (consumes)</span><input className="mono" value={e.consumes} onChange={(ev) => set({ consumes: ev.target.value })} list="media-types" placeholder="application/json" spellCheck={false} /></label>
        <label className="field"><span>Response content type (produces)</span><input className="mono" value={e.produces} onChange={(ev) => set({ produces: ev.target.value })} list="media-types" placeholder="application/json" spellCheck={false} /></label>
      </div>
      <datalist id="media-types"><option value="application/json" /><option value="application/xml" /><option value="text/plain" /></datalist>
      <label className="field"><span>Summary</span><input value={e.summary} onChange={(ev) => set({ summary: ev.target.value })} /></label>
      <label className="field"><span>Description</span><textarea rows={2} value={e.description} onChange={(ev) => set({ description: ev.target.value })} /></label>
      <div className="grid-3">
        <label className="field"><span>Return type</span><input className="mono" list="java-types" value={e.returnType} onChange={(ev) => set({ returnType: ev.target.value })} spellCheck={false} /></label>
        <label className="field"><span>Success status</span><input type="number" min={200} max={299} value={e.successStatus} onChange={(ev) => set({ successStatus: Number(ev.target.value) })} /></label>
        <ListInput label="Security roles (@Secured)" value={e.roles} onChange={(roles) => set({ roles })} placeholder="ROLE_CLIENT, ROLE_TRUSTED_CLIENT" />
      </div>
      <datalist id="java-types">{TYPE_CATALOGUE.map((t) => <option key={t} value={t} />)}</datalist>

      <div>
        <div className="field-label" style={{ marginBottom: 4 }}>Documented response codes</div>
        {e.responseCodes.map((r, i) => (
          <div className="item-row" key={i}>
            <input type="number" style={{ width: 90 }} aria-label={`Response code ${i + 1}`} value={r.code} onChange={(ev) => set({ responseCodes: e.responseCodes.map((x, k) => (k === i ? { ...x, code: Number(ev.target.value) } : x)) })} />
            <input aria-label={`Response description ${i + 1}`} value={r.description} placeholder="Description" onChange={(ev) => set({ responseCodes: e.responseCodes.map((x, k) => (k === i ? { ...x, description: ev.target.value } : x)) })} />
            <button type="button" className="icon-btn" aria-label={`Remove response code ${i + 1}`} onClick={() => set({ responseCodes: e.responseCodes.filter((_, k) => k !== i) })}><IconTrash /></button>
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => set({ responseCodes: [...e.responseCodes, { code: 400, description: '' }] })}><IconPlus />Add response code</button>
      </div>

      <div>
        <div className="field-label" style={{ marginBottom: 4 }}>Parameters</div>
        <div className="stack">
          {e.params.length === 0 && <p className="muted small">No parameters.</p>}
          {e.params.map((p, i) => (
            <div className="param-card" key={i} role="group" aria-label={`Parameter ${i + 1}`}>
              <label className="field s2"><span>Binding</span>
                <select value={p.kind} aria-label={`Binding of parameter ${i + 1}`} onChange={(ev) => { const kind = ev.target.value as ParamKind; setParam(i, { kind, required: kind === 'path' || kind === 'body' ? true : p.required, ...(kind === 'body' ? { name: '' } : {}) }); }}>
                  <option value="path">@PathVariable</option><option value="query">@RequestParam</option><option value="header">@RequestHeader</option><option value="body">@RequestBody</option>
                </select>
              </label>
              <label className="field s2"><span>External name</span>
                <input className="mono" aria-label={`External name of parameter ${i + 1}`} disabled={p.kind === 'body'} value={p.name} spellCheck={false}
                  onChange={(ev) => setParam(i, { name: ev.target.value, javaName: p.javaName === '' || p.javaName === toJavaName(p.name) ? toJavaName(ev.target.value) : p.javaName })} />
              </label>
              <label className="field s2"><span>Java name</span><input className="mono" aria-label={`Java name of parameter ${i + 1}`} value={p.javaName} spellCheck={false} onChange={(ev) => setParam(i, { javaName: ev.target.value })} /></label>
              <label className="field s2"><span>Java type</span><input className="mono" aria-label={`Java type of parameter ${i + 1}`} list="java-types" value={p.javaType} spellCheck={false} onChange={(ev) => setParam(i, { javaType: ev.target.value })} /></label>
              <label className="field s2"><span>Default value</span><input className="mono" aria-label={`Default of parameter ${i + 1}`} disabled={p.kind === 'path' || p.kind === 'body'} value={p.defaultValue} spellCheck={false} onChange={(ev) => setParam(i, { defaultValue: ev.target.value })} /></label>
              <div className="field s2"><span>Options</span>
                <label className="check"><input type="checkbox" checked={p.required} disabled={p.kind === 'path' || p.kind === 'body'} onChange={(ev) => setParam(i, { required: ev.target.checked })} />required</label>
              </div>
              <label className="field s6"><span>Description</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <input aria-label={`Description of parameter ${i + 1}`} value={p.description} onChange={(ev) => setParam(i, { description: ev.target.value })} />
                  <button type="button" className="icon-btn" aria-label={`Remove parameter ${i + 1}`} onClick={() => set({ params: e.params.filter((_, k) => k !== i) })}><IconTrash /></button>
                </span>
              </label>
            </div>
          ))}
          <div className="pill-row">
            <button type="button" className="btn btn-sm" onClick={() => set({ params: [...e.params, newParam('query')] })}><IconPlus />Add parameter</button>
            {missing.length > 0 && (
              <button type="button" className="btn btn-sm" onClick={() => set({ params: [...e.params, ...missing.map((m) => ({ ...newParam('path'), name: m, javaName: toJavaName(m) }))] })}>
                Add path variable{missing.length > 1 ? 's' : ''}: {missing.join(', ')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EndpointPicker({ config, sel, onSelect, onAdd, onDuplicate, onDelete }: { config: OccConfig; sel: number; onSelect: (i: number) => void; onAdd: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return (
    <div className="pill-row" role="group" aria-label="Endpoints">
      {config.endpoints.map((e, i) => (
        <button key={i} type="button" className="pill" aria-pressed={i === sel} onClick={() => onSelect(i)}>{e.httpMethod} {e.methodName || `#${i + 1}`}</button>
      ))}
      <button type="button" className="btn btn-sm" onClick={onAdd}><IconPlus />Endpoint</button>
      <button type="button" className="icon-btn" aria-label="Duplicate selected endpoint" disabled={config.endpoints.length === 0} onClick={onDuplicate}><IconDuplicate /></button>
      <button type="button" className="icon-btn" aria-label="Delete selected endpoint" disabled={config.endpoints.length === 0} onClick={onDelete}><IconTrash /></button>
    </div>
  );
}
