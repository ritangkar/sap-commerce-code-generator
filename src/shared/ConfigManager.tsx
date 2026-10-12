import { useEffect, useRef, useState } from 'react';
import { downloadText, readFileText, safeFileName } from './files';
import { IconDownload, IconSave, IconTrash, IconUpload } from './icons';
import { ConfirmDialog, Modal } from './Modal';
import { makeEnvelope, newId, parseEnvelope, readJson, writeJson, type SavedEntry, type StorageResult } from './storage';
import { useToast } from './Toast';

interface Props<T> {
  open: boolean;
  onClose: () => void;
  /** Storage namespace, e.g. "impex". */
  tool: string;
  schema: string;
  version: number;
  current: T;
  parse: (v: unknown) => StorageResult<T>;
  onLoad: (config: T, name: string) => void;
  defaultName: string;
}

/** Save / load / rename / delete configurations in localStorage plus JSON backup & restore. */
export function ConfigManager<T>({ open, onClose, tool, schema, version, current, parse, onLoad, defaultName }: Props<T>) {
  const toast = useToast();
  const key = `saved:${tool}`;
  const [entries, setEntries] = useState<SavedEntry<T>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(defaultName);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<SavedEntry<T> | null>(null);
  const [loading, setLoading] = useState<{ config: T; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const r = readJson<SavedEntry<unknown>[]>(key, []);
    if (!r.ok) {
      setError(r.error);
      setEntries([]);
      return;
    }
    // Entries are validated individually; corrupted ones are skipped but reported, never deleted.
    const ok: SavedEntry<T>[] = [];
    let bad = 0;
    for (const e of Array.isArray(r.value) ? r.value : []) {
      const p = e && typeof e === 'object' ? parse((e as SavedEntry<unknown>).config) : null;
      if (p && p.ok) ok.push({ id: String((e as SavedEntry<unknown>).id), name: String((e as SavedEntry<unknown>).name), savedAt: String((e as SavedEntry<unknown>).savedAt), config: p.value });
      else bad++;
    }
    setError(bad ? `${bad} saved configuration${bad > 1 ? 's' : ''} could not be read and ${bad > 1 ? 'are' : 'is'} hidden (not deleted).` : null);
    setEntries(ok);
    setName(defaultName);
  }, [open, key, parse, defaultName]);

  const persist = (next: SavedEntry<T>[]): boolean => {
    // Hidden corrupted entries would be lost on write; re-read raw list and keep unreadable ones.
    const raw = readJson<SavedEntry<unknown>[]>(key, []);
    const keepIds = new Set(next.map((e) => e.id));
    const hidden = raw.ok && Array.isArray(raw.value) ? raw.value.filter((e) => !entries.some((x) => x.id === (e as SavedEntry<unknown>).id) && !keepIds.has((e as SavedEntry<unknown>).id)) : [];
    const r = writeJson(key, [...next, ...hidden]);
    if (!r.ok) {
      setError(r.error);
      toast(r.error, 'error');
      return false;
    }
    setEntries(next);
    return true;
  };

  const save = () => {
    const n = name.trim() || defaultName;
    const existing = entries.find((e) => e.name === n);
    const entry: SavedEntry<T> = { id: existing?.id ?? newId(), name: n, savedAt: new Date().toISOString(), config: current };
    if (persist(existing ? entries.map((e) => (e.id === existing.id ? entry : e)) : [...entries, entry])) {
      toast(existing ? `Updated “${n}”` : `Saved “${n}”`);
      onLoad(current, n);
    }
  };

  const exportJson = () => {
    const n = name.trim() || defaultName;
    downloadText(`${safeFileName(n)}.${tool}.json`, JSON.stringify(makeEnvelope(schema, version, n, current), null, 2) + '\n', 'application/json');
  };

  const importFile = async (f: File) => {
    try {
      const text = await readFileText(f);
      const r = parseEnvelope<T>(text, schema, version, parse);
      if (!r.ok) {
        toast(`Import failed – current work unchanged. ${r.error}`, 'error');
        return;
      }
      setLoading({ config: r.value.config, name: r.value.name });
    } catch (e) {
      toast(`Could not read file: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Saved configurations" wide>
        <p className="muted small">
          Stored only in this browser (localStorage). Clearing site data removes them – use <strong>Export JSON</strong> for a backup file.
        </p>
        {error && <p className="banner banner-warning" role="alert">{error}</p>}
        <div className="row-gap">
          <label className="field grow">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          </label>
          <button type="button" className="btn btn-primary" onClick={save}><IconSave />Save current</button>
          <button type="button" className="btn" onClick={exportJson}><IconDownload />Export JSON</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}><IconUpload />Import JSON…</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="Import configuration JSON file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
        </div>
        {entries.length === 0 ? (
          <p className="empty">No saved configurations yet.</p>
        ) : (
          <ul className="saved-list">
            {entries.map((e) => (
              <li key={e.id}>
                <div className="saved-main">
                  {renaming?.id === e.id ? (
                    <input
                      autoFocus
                      aria-label="New name"
                      value={renaming.name}
                      onChange={(ev) => setRenaming({ id: e.id, name: ev.target.value })}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' && renaming.name.trim()) { persist(entries.map((x) => (x.id === e.id ? { ...x, name: renaming.name.trim() } : x))); setRenaming(null); }
                        if (ev.key === 'Escape') setRenaming(null);
                      }}
                    />
                  ) : (
                    <strong>{e.name}</strong>
                  )}
                  <span className="muted small">{new Date(e.savedAt).toLocaleString()}</span>
                </div>
                <div className="saved-actions">
                  <button type="button" className="btn btn-sm" onClick={() => setLoading({ config: e.config, name: e.name })}>Load</button>
                  <button type="button" className="btn btn-sm" onClick={() => setRenaming({ id: e.id, name: e.name })}>Rename</button>
                  <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => setDeleting(e)} aria-label={`Delete ${e.name}`}><IconTrash />Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <ConfirmDialog
        open={!!loading}
        title="Replace current work?"
        message="Loading replaces the configuration you are editing. Save it first if you want to keep it."
        confirmLabel="Replace"
        danger
        onCancel={() => setLoading(null)}
        onConfirm={() => { if (loading) { onLoad(loading.config, loading.name); toast(`Loaded “${loading.name}”`); onClose(); } setLoading(null); }}
      />
      <ConfirmDialog
        open={!!deleting}
        title="Delete saved configuration?"
        message={<>“{deleting?.name}” will be removed from this browser. This cannot be undone.</>}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => { if (deleting) { persist(entries.filter((x) => x.id !== deleting.id)); toast(`Deleted “${deleting.name}”`); } setDeleting(null); }}
      />
    </>
  );
}
