import { useState } from 'react';
import { IconLeft, IconPlus, IconRight, IconTrash } from '../../shared/icons';
import { ConfirmDialog } from '../../shared/Modal';
import { addColumn, discardedCells, emptyColumn, moveColumn, removeColumn, updateColumn, type ImpexConfig } from './model';
import { columnHeader } from './serializer';

interface Props {
  config: ImpexConfig;
  onChange: (c: ImpexConfig) => void;
}

export function HeaderEditor({ config, onChange }: Props) {
  const [removing, setRemoving] = useState<number | null>(null);
  const tryRemove = (i: number) => (discardedCells(config, i) > 0 ? setRemoving(i) : onChange(removeColumn(config, i)));
  return (
    <div className="stack">
      {config.columns.length === 0 && <p className="empty">No columns yet. Add the first attribute column.</p>}
      {config.columns.map((c, i) => (
        <div className="col-card" key={i} role="group" aria-label={`Column ${i + 1}`}>
          <div className="col-card-head">
            <strong>Column {i + 1}</strong>
            <button type="button" className="icon-btn" aria-label={`Move column ${i + 1} left`} disabled={i === 0} onClick={() => onChange(moveColumn(config, i, i - 1))}><IconLeft /></button>
            <button type="button" className="icon-btn" aria-label={`Move column ${i + 1} right`} disabled={i === config.columns.length - 1} onClick={() => onChange(moveColumn(config, i, i + 1))}><IconRight /></button>
            <button type="button" className="icon-btn" aria-label={`Remove column ${i + 1}`} onClick={() => tryRemove(i)}><IconTrash /></button>
          </div>
          <label className="field">
            <span>Attribute / expression</span>
            <input className="mono" value={c.attribute} spellCheck={false} onChange={(e) => onChange(updateColumn(config, i, { attribute: e.target.value }))} aria-label={`Attribute of column ${i + 1}`} placeholder="code or catalogVersion(catalog(id),version)" />
          </label>
          <label className="field">
            <span>lang</span>
            <input className="mono" value={c.lang} spellCheck={false} onChange={(e) => onChange(updateColumn(config, i, { lang: e.target.value }))} aria-label={`Language of column ${i + 1}`} placeholder="en" />
          </label>
          <label className="field">
            <span>default</span>
            <input className="mono" value={c.defaultValue} spellCheck={false} onChange={(e) => onChange(updateColumn(config, i, { defaultValue: e.target.value }))} aria-label={`Default value of column ${i + 1}`} />
          </label>
          <div className="field">
            <span>Flags</span>
            <div className="pill-row">
              <label className="check"><input type="checkbox" checked={c.unique} onChange={(e) => onChange(updateColumn(config, i, { unique: e.target.checked }))} />unique</label>
              <label className="check"><input type="checkbox" checked={c.allowNull} onChange={(e) => onChange(updateColumn(config, i, { allowNull: e.target.checked }))} />allownull</label>
            </div>
          </div>
          <label className="field wide">
            <span>Raw modifiers (written verbatim after the fields above)</span>
            <input className="mono" value={c.rawModifiers} spellCheck={false} onChange={(e) => onChange(updateColumn(config, i, { rawModifiers: e.target.value }))} aria-label={`Raw modifiers of column ${i + 1}`} placeholder="virtual=true,translator=de.example.MyTranslator" />
          </label>
          <p className="wide small muted">Header cell: <code>{columnHeader(c) || '—'}</code></p>
        </div>
      ))}
      <div><button type="button" className="btn" onClick={() => onChange(addColumn(config, emptyColumn()))}><IconPlus />Add column</button></div>
      <details className="sect">
        <summary>Syntax guide</summary>
        <div className="sect-body small">
          <p>Modifiers are written in canonical order: <code>unique, lang, allownull, default</code>, then your raw modifiers exactly as typed.</p>
          <p><code>name[lang=en]</code> · <code>unit(code)[default=pieces]</code> · <code>supercategories(code,catalogVersion(catalog(id),version))</code></p>
          <p>Attribute text is never rewritten, so project-specific expressions, macros (<code>$catalogVersion</code>) and translators are preserved. Whether an attribute or modifier is valid for a type cannot be checked offline.</p>
        </div>
      </details>
      <ConfirmDialog
        open={removing !== null}
        title="Remove column?"
        message={removing !== null && <>Column <strong>{config.columns[removing]?.attribute || removing + 1}</strong> contains <strong>{discardedCells(config, removing)}</strong> non-empty cell{discardedCells(config, removing) === 1 ? '' : 's'}. Removing it discards those values.</>}
        confirmLabel="Remove and discard"
        danger
        onCancel={() => setRemoving(null)}
        onConfirm={() => { if (removing !== null) onChange(removeColumn(config, removing)); setRemoving(null); }}
      />
    </div>
  );
}

