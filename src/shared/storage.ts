/**
 * Versioned, defensive wrapper around localStorage. Every access is wrapped in
 * try/catch because storage can be unavailable (private mode, blocked, quota).
 * Nothing here ever leaves the browser.
 */
export const STORAGE_PREFIX = 'scg:v1:';

export type StorageResult<T> = { ok: true; value: T } | { ok: false; error: string };

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readRaw(key: string): StorageResult<string | null> {
  const s = store();
  if (!s) return { ok: false, error: 'Browser storage is unavailable.' };
  try {
    return { ok: true, value: s.getItem(STORAGE_PREFIX + key) };
  } catch (e) {
    return { ok: false, error: `Could not read browser storage: ${(e as Error).message}` };
  }
}

export function writeRaw(key: string, value: string): StorageResult<true> {
  const s = store();
  if (!s) return { ok: false, error: 'Browser storage is unavailable.' };
  try {
    s.setItem(STORAGE_PREFIX + key, value);
    return { ok: true, value: true };
  } catch (e) {
    return { ok: false, error: `Could not write browser storage (it may be full or blocked): ${(e as Error).message}` };
  }
}

export function removeRaw(key: string): StorageResult<true> {
  const s = store();
  if (!s) return { ok: false, error: 'Browser storage is unavailable.' };
  try {
    s.removeItem(STORAGE_PREFIX + key);
    return { ok: true, value: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function readJson<T>(key: string, fallback: T): StorageResult<T> {
  const r = readRaw(key);
  if (!r.ok) return r;
  if (r.value === null) return { ok: true, value: fallback };
  try {
    return { ok: true, value: JSON.parse(r.value) as T };
  } catch {
    return { ok: false, error: `Stored data for "${key}" is corrupted and was ignored.` };
  }
}

export function writeJson(key: string, value: unknown): StorageResult<true> {
  return writeRaw(key, JSON.stringify(value));
}

/** Envelope used for saved configurations and JSON file backups. */
export interface ConfigEnvelope<T> {
  schema: string;
  version: number;
  name: string;
  savedAt: string;
  config: T;
}

export interface SavedEntry<T> {
  id: string;
  name: string;
  savedAt: string;
  config: T;
}

export function makeEnvelope<T>(schema: string, version: number, name: string, config: T): ConfigEnvelope<T> {
  return { schema, version, name, savedAt: new Date().toISOString(), config };
}

/**
 * Parse and validate an envelope from untrusted JSON text. The tool-specific
 * `validate` function must return a fully-normalised config or an error string;
 * nothing is applied to application state unless this returns ok.
 */
export function parseEnvelope<T>(
  text: string,
  schema: string,
  version: number,
  validate: (config: unknown) => { ok: true; value: T } | { ok: false; error: string },
): StorageResult<{ name: string; config: T }> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${(e as Error).message}` };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'Expected a JSON object.' };
  const o = raw as Record<string, unknown>;
  if (o.schema !== schema) return { ok: false, error: `Wrong file type: expected schema "${schema}".` };
  if (typeof o.version !== 'number' || o.version > version)
    return { ok: false, error: `Unsupported schema version ${String(o.version)} (this app supports up to ${version}).` };
  const v = validate(o.config);
  if (!v.ok) return { ok: false, error: v.error };
  return { ok: true, value: { name: typeof o.name === 'string' ? o.name : 'Imported', config: v.value } };
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
