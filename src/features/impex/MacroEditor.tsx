import { IconDown, IconPlus, IconTrash, IconUp } from '../../shared/icons';
import { moveItem, type ImpexConfig } from './model';
import { expandMacros, macroDefs } from './validate';

interface Props {
  config: ImpexConfig;
  onChange: (c: ImpexConfig) => void;
}

export function MacroEditor({ config, onChange }: Props) {
  const defs = macroDefs(config);
  const set = (i: number, patch: Partial<{ name: string; value: string }>) =>
    onChange({ ...config, macros: config.macros.map((m, k) => (k === i ? { ...m, ...patch } : m)) });
  return (
    <div className="stack">
      {config.macros.length === 0 && <p className="empty">No macros. Macros such as <code>$catalogVersion=…</code> keep scripts readable and are written before the header in this order.</p>}
      {config.macros.map((m, i) => (
        <div key={i} className="stack" role="group" aria-label={`Macro ${i + 1}`}>
          <div className="item-row">
            <span className="mono">$</span>
            <input className="mono" style={{ maxWidth: 200 }} aria-label={`Name of macro ${i + 1}`} value={m.name} spellCheck={false} onChange={(e) => set(i, { name: e.target.value.replace(/^\$/, '') })} placeholder="name" />
            <span className="mono">=</span>
            <input className="mono" aria-label={`Value of macro ${i + 1}`} value={m.value} spellCheck={false} onChange={(e) => set(i, { value: e.target.value })} placeholder="value" />
            <button type="button" className="icon-btn" aria-label={`Move macro ${i + 1} up`} disabled={i === 0} onClick={() => onChange({ ...config, macros: moveItem(config.macros, i, i - 1) })}><IconUp /></button>
            <button type="button" className="icon-btn" aria-label={`Move macro ${i + 1} down`} disabled={i === config.macros.length - 1} onClick={() => onChange({ ...config, macros: moveItem(config.macros, i, i + 1) })}><IconDown /></button>
            <button type="button" className="icon-btn" aria-label={`Delete macro ${i + 1}`} onClick={() => onChange({ ...config, macros: config.macros.filter((_, k) => k !== i) })}><IconTrash /></button>
          </div>
          {/\$/.test(m.value) && <p className="small muted">Expands to: <code>{expandMacros(m.value, defs)}</code></p>}
        </div>
      ))}
      <div><button type="button" className="btn" onClick={() => onChange({ ...config, macros: [...config.macros, { name: '', value: '' }] })}><IconPlus />Add macro</button></div>
      <p className="small muted">The expansion is a read-only preview. The generated script keeps your <code>$macro</code> references untouched. <code>$config-…</code> references are resolved by SAP Commerce at import time.</p>
    </div>
  );
}
