import { useState } from 'react';
import { CodeView } from '../../shared/CodeView';
import { IconPlay } from '../../shared/icons';
import { KvEditor } from './KvEditor';
import { simulate, type MockResult } from './mock';
import { fullPath, HTTP_METHODS, type HttpMethod, type OccConfig, type OccEndpoint } from './model';

interface Props {
  config: OccConfig;
  setConfig: (c: OccConfig) => void;
}

const sampleFor = (type: string, name: string) => (/^(Integer|Long|Short|int|long)$/.test(type) ? '1' : /^(Double|BigDecimal|Float)$/.test(type) ? '1.5' : /Boolean/.test(type) ? 'true' : `sample-${name}`);

function samplePath(c: OccConfig, e: OccEndpoint): string {
  return fullPath(c, e).replace(/\{(\w+)\}/g, (_m, n: string) => {
    if (n === 'baseSiteId') return 'electronics';
    const p = e.params.find((x) => x.kind === 'path' && x.name === n);
    return sampleFor(p?.javaType ?? 'String', n);
  });
}

export function MockTester({ config, setConfig }: Props) {
  const req = config.mockRequest;
  const [mockIdx, setMockIdx] = useState(0);
  const [result, setResult] = useState<MockResult | null>(null);
  const [running, setRunning] = useState(false);
  const idx = Math.min(mockIdx, Math.max(0, config.endpoints.length - 1));
  const ep = config.endpoints[idx];
  const setReq = (patch: Partial<typeof req>) => setConfig({ ...config, mockRequest: { ...req, ...patch } });
  const setMock = (patch: Partial<OccEndpoint['mock']>) => setConfig({ ...config, endpoints: config.endpoints.map((e, i) => (i === idx ? { ...e, mock: { ...e.mock, ...patch } } : e)) });

  const run = async () => {
    setRunning(true);
    const r = simulate(config, req);
    // Simulated delay only: a timer, never a network call.
    if (r.durationMs > 0) await new Promise((res) => setTimeout(res, Math.min(r.durationMs, 10000)));
    setResult(r);
    setRunning(false);
    const hit = config.endpoints.findIndex((e) => e.methodName === r.matched?.methodName);
    if (hit >= 0) setMockIdx(hit);
  };

  const fill = () => {
    if (!ep) return;
    const q = ep.params.filter((p) => p.kind === 'query' && p.required && p.defaultValue === '').map((p) => ({ key: p.name, value: sampleFor(p.javaType, p.name) }));
    const h = ep.params.filter((p) => p.kind === 'header' && p.required && p.defaultValue === '').map((p) => ({ key: p.name, value: sampleFor(p.javaType, p.name) }));
    const hasBody = ep.params.some((p) => p.kind === 'body');
    const body = hasBody && config.dto.enabled ? JSON.stringify(Object.fromEntries(config.dto.fields.filter((f) => f.required).map((f) => [f.name, sampleFor(f.javaType, f.name)])), null, 2) : hasBody ? '{}' : '';
    setReq({ method: ep.httpMethod, path: samplePath(config, ep), query: q, headers: [...h, ...(hasBody ? [{ key: 'Content-Type', value: ep.consumes || 'application/json' }] : [])], body });
  };

  return (
    <div className="workspace">
      <section className="pane" aria-label="Mock request">
        <div className="pane-head"><h2>Request</h2><button type="button" className="btn btn-sm" onClick={fill} disabled={!ep}>Fill sample for “{ep?.methodName ?? '…'}”</button></div>
        <div className="pane-body stack">
          <p className="banner banner-info" style={{ margin: 0 }}>Local simulation only. Nothing is sent over the network and no Java is executed.</p>
          <div className="row-gap" style={{ margin: 0 }}>
            <label className="field"><span>Method</span>
              <select value={req.method} onChange={(e) => setReq({ method: e.target.value as HttpMethod })}>{HTTP_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
            </label>
            <label className="field grow"><span>Request path (relative to the OCC root)</span>
              <input className="mono" value={req.path} spellCheck={false} onChange={(e) => setReq({ path: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void run()} />
            </label>
          </div>
          <KvEditor label="Query parameters" items={req.query} onChange={(query) => setReq({ query })} />
          <KvEditor label="Request headers" items={req.headers} onChange={(headers) => setReq({ headers })} keyPlaceholder="Header-Name" />
          <label className="field"><span>JSON request body (optional)</span>
            <textarea className="mono" rows={5} value={req.body} spellCheck={false} onChange={(e) => setReq({ body: e.target.value })} />
          </label>
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
          <h3 style={{ fontSize: 13 }}>Mock response</h3>
          {config.endpoints.length === 0 ? <p className="muted">Add an endpoint in the Builder first.</p> : (
            <>
              <label className="field"><span>Configure the response returned by endpoint</span>
                <select value={idx} onChange={(e) => setMockIdx(Number(e.target.value))}>{config.endpoints.map((e, i) => <option key={i} value={i}>{e.httpMethod} {fullPath(config, e)} ({e.methodName})</option>)}</select>
              </label>
              <div className="grid-2">
                <label className="field"><span>Status code</span><input type="number" min={100} max={599} value={ep.mock.status} onChange={(e) => setMock({ status: Number(e.target.value) })} /></label>
                <label className="field"><span>Simulated delay (ms)</span><input type="number" min={0} max={10000} value={ep.mock.delayMs} onChange={(e) => setMock({ delayMs: Math.max(0, Number(e.target.value)) })} /></label>
              </div>
              <KvEditor label="Response headers" items={ep.mock.headers} onChange={(headers) => setMock({ headers })} keyPlaceholder="Header-Name" />
              <label className="field"><span>Response body</span>
                <textarea className="mono" rows={5} value={ep.mock.body} spellCheck={false} onChange={(e) => setMock({ body: e.target.value })} />
                <small>Placeholders: <code>{'{{path.name}}'}</code>, <code>{'{{query.name}}'}</code>, <code>{'{{header.name}}'}</code></small>
              </label>
            </>
          )}
          <div><button type="button" className="btn btn-primary" onClick={() => void run()} disabled={running}><IconPlay />{running ? 'Simulating…' : 'Run mock request'}</button></div>
        </div>
      </section>
      <section className="pane pane-sticky" aria-label="Mock result" aria-live="polite">
        <div className="pane-head"><h2>Result</h2><span className="badge badge-mock">MOCK SIMULATION</span></div>
        {!result ? <p className="empty" style={{ margin: 14 }}>Run a request to see the simulated response. A mock response is not evidence that your real controller compiles or behaves the same way.</p> : (
          <div className="pane-body stack">
            <div className="result-box">
              <div className="result-head">
                <span className={`status-pill status-${String(result.status)[0]}`}>{result.status} {result.statusText}</span>
                <span className="small muted">{result.durationMs} ms (simulated)</span>
              </div>
              <dl className="kv">
                <dt>Matched endpoint</dt><dd>{result.matched ? `${result.matched.methodName} · ${result.matched.pattern}` : 'none'}</dd>
                <dt>Path variables</dt><dd>{Object.keys(result.pathVariables).length ? Object.entries(result.pathVariables).map(([k, v]) => `${k}=${v}`).join(', ') : '—'}</dd>
                <dt>Query (applied)</dt><dd>{Object.keys(result.queryParameters).length ? Object.entries(result.queryParameters).map(([k, v]) => `${k}=${v}`).join(', ') : '—'}</dd>
              </dl>
            </div>
            {result.issues.length > 0 && (
              <ul className="diag-list" aria-label="Input and validation messages">
                {result.issues.map((i, k) => <li key={k} className={`diag sev-${i.severity === 'error' ? 'error' : 'info'}`}><span>{i.severity === 'error' ? 'Error' : 'Info'}: {i.message}</span></li>)}
              </ul>
            )}
            <div className="result-box">
              <div className="result-head"><strong className="small">Response headers</strong></div>
              <dl className="kv">{result.headers.length ? result.headers.flatMap((h, i) => [<dt key={`k${i}`}>{h.key}</dt>, <dd key={`v${i}`}>{h.value}</dd>]) : <dd>—</dd>}</dl>
            </div>
            <div className="result-box"><div className="result-head"><strong className="small">Response body</strong></div>
              <CodeView code={result.body || '(empty)'} lang="json" label="Mock response body" maxHeight="320px" />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
