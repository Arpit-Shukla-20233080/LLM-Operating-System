import { create } from 'zustand';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface ConfigStore {
  config: AnyRecord | null;
  isDirty: boolean;
  loading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  /** Deep-update a value at a key-path, e.g. ['agents','defaults','model'] */
  update: (path: string[], value: unknown) => void;
  save: () => Promise<{ ok: boolean; message: string }>;
  reload: () => Promise<{ changes: string[] }>;
}

function deepSet(obj: AnyRecord, path: string[], value: unknown): AnyRecord {
  const clone = structuredClone(obj);
  let cur: AnyRecord = clone;
  for (let i = 0; i < path.length - 1; i++) {
    if (cur[path[i]] == null || typeof cur[path[i]] !== 'object') {
      cur[path[i]] = {};
    }
    cur = cur[path[i]] as AnyRecord;
  }
  cur[path[path.length - 1]] = value;
  return clone;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: null,
  isDirty: false,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch('/config');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const config: AnyRecord = await res.json();
      set({ config, loading: false, isDirty: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
    }
  },

  update: (path, value) => {
    const { config } = get();
    if (!config) return;
    set({ config: deepSet(config, path, value), isDirty: true });
  },

  save: async () => {
    const { config } = get();
    if (!config) return { ok: false, message: 'No config loaded' };
    try {
      const res = await fetch('/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patch: config }),
      });
      if (res.ok) {
        set({ isDirty: false });
        return { ok: true, message: 'Configuration saved.' };
      } else {
        const data = await res.json().catch(() => ({}));
        return { ok: false, message: JSON.stringify(data?.detail ?? 'Save failed') };
      }
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  },

  reload: async () => {
    try {
      const res = await fetch('/config/reload', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ changes: string[] }>;
    } catch (err) {
      return { changes: [`Error: ${(err as Error).message}`] };
    }
  },
}));
