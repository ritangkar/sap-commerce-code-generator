import { useEffect, useState } from 'react';
import { IconPlus, IconTrash } from '../../shared/icons';
import type { KV } from './model';

export function KvEditor({ label, items, onChange, keyPlaceholder = 'name', valuePlaceholder = 'value' }: { label: string; items: KV[]; onChange: (v: KV[]) => void; keyPlaceholder?: string; valuePlaceholder?: string }) {
  return (
    <div role="group" aria-label={label}>
      <div className="field-label" style={{ marginBottom: 4 }}>{label}</div>
      {items.map((it, i) => (
        <div className="kv-row" key={i}>
          <input className="mono" aria-label={`${label} name ${i + 1}`} value={it.key} placeholder={keyPlaceholder} spellCheck={false} onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, key: e.target.value } : x)))} />
          <input className="mono" aria-label={`${label} value ${i + 1}`} value={it.value} placeholder={valuePlaceholder} spellCheck={false} onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
          <button type="button" className="icon-btn" aria-label={`Remove ${label} ${i + 1}`} onClick={() => onChange(items.filter((_, k) => k !== i))}><IconTrash /></button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => onChange([...items, { key: '', value: '' }])}><IconPlus />Add</button>
    </div>
  );
}

/** Comma/line separated list that keeps the raw text while typing. */
export function ListInput({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const parse = (t: string) => t.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  const [text, setText] = useState(value.join(', '));
  useEffect(() => {
    if (JSON.stringify(parse(text)) !== JSON.stringify(value)) setText(value.join(', '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input className="mono" value={text} placeholder={placeholder} spellCheck={false} onChange={(e) => { setText(e.target.value); onChange(parse(e.target.value)); }} />
    </label>
  );
}
