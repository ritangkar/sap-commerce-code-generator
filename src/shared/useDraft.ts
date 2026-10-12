import { useCallback, useEffect, useRef, useState } from 'react';
import { readRaw, writeRaw, type StorageResult } from './storage';

/** In-memory copy so work survives route changes even when browser storage is unavailable. */
const memory = new Map<string, unknown>();

/**
 * Editable state that is restored on mount and persisted (debounced) to localStorage.
 * `parse` validates stored data; invalid or corrupted data is ignored and reported via `storageError`.
 */
export function useDraft<T>(key: string, initial: () => T, parse: (v: unknown) => StorageResult<T>) {
  const [storageError, setStorageError] = useState<string | null>(null);
  const [state, setState] = useState<T>(() => {
    if (memory.has(key)) return memory.get(key) as T;
    const r = readRaw(`draft:${key}`);
    if (r.ok && r.value) {
      try {
        const p = parse(JSON.parse(r.value));
        if (p.ok) return p.value;
      } catch {
        /* corrupted – fall through to default */
      }
    }
    return initial();
  });
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(state);
  latest.current = state;
  const first = useRef(true);

  useEffect(() => {
    memory.set(key, state);
    if (first.current) { first.current = false; return; }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = writeRaw(`draft:${key}`, JSON.stringify(state));
      setStorageError(r.ok ? null : r.error);
    }, 300);
    return () => window.clearTimeout(timer.current);
  }, [key, state]);

  // Flush immediately when the page is hidden/closed so a pending debounce is never lost.
  useEffect(() => {
    const flush = () => { if (!first.current) writeRaw(`draft:${key}`, JSON.stringify(latest.current)); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', flush); flush(); };
  }, [key]);

  const reset = useCallback(() => setState(initial()), [initial]);
  return { state, setState, reset, storageError };
}
