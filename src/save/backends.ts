// The three ways a save reaches disk:
//  - tauri: real file in %APPDATA%\com.gyeboorovsky.typingrpg\save.json
//  - file:  real file the user picked via the File System Access API (Chromium)
//  - local: localStorage baseline, always written in the browser
import type { SaveData } from '../game/types';

export interface SaveBackend {
  readonly name: 'tauri' | 'file' | 'local';
  load(): Promise<SaveData | null>;
  save(d: SaveData): Promise<void>;
}

const LS_KEY = 'typingRPG.save';

export const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;

// --- localStorage ---
export const localBackend: SaveBackend = {
  name: 'local',
  async load() {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  },
  async save(d) { localStorage.setItem(LS_KEY, JSON.stringify(d)); },
};

/** Synchronous write for beforeunload, where async won't finish. */
export function localSaveSync(d: SaveData): void {
  localStorage.setItem(LS_KEY, JSON.stringify(d));
}

// --- Tauri fs plugin (dynamic import so web bundles never fetch it) ---
export async function tauriBackend(): Promise<SaveBackend> {
  const fs = await import('@tauri-apps/plugin-fs');
  const opts = { baseDir: fs.BaseDirectory.AppData };
  return {
    name: 'tauri',
    async load() {
      try { return JSON.parse(await fs.readTextFile('save.json', opts)) as SaveData; }
      catch { return null; }
    },
    async save(d) {
      try { await fs.mkdir('', { ...opts, recursive: true }); } catch { /* already exists */ }
      await fs.writeTextFile('save.json', JSON.stringify(d, null, 2), opts);
    },
  };
}

// --- File System Access API (Chromium-only; feature-detected) ---
declare global {
  interface Window {
    showSaveFilePicker?: (opts?: object) => Promise<FileSystemFileHandle>;
  }
  interface FileSystemFileHandle {
    queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  }
}

export const supportsFilePicker = (): boolean => typeof window.showSaveFilePicker === 'function';

function fileBackendFrom(h: FileSystemFileHandle): SaveBackend {
  return {
    name: 'file',
    async load() {
      try {
        const text = await (await h.getFile()).text();
        return text.trim() ? (JSON.parse(text) as SaveData) : null;
      } catch { return null; }
    },
    async save(d) {
      const w = await h.createWritable();
      await w.write(JSON.stringify(d, null, 2));
      await w.close();
    },
  };
}

/** Silently re-attach the previously picked save file (needs granted permission). */
export async function restoreFileBackend(): Promise<SaveBackend | null> {
  if (!supportsFilePicker()) return null;
  const h = await idbGet<FileSystemFileHandle>('save-handle');
  if (!h || !h.queryPermission) return null;
  if ((await h.queryPermission({ mode: 'readwrite' })) !== 'granted') return null;
  return fileBackendFrom(h);
}

/** From a user gesture: re-grant the stored handle or pick a new file. */
export async function pickFileBackend(): Promise<SaveBackend | null> {
  const prev = await idbGet<FileSystemFileHandle>('save-handle');
  if (prev?.requestPermission && (await prev.requestPermission({ mode: 'readwrite' })) === 'granted') {
    return fileBackendFrom(prev);
  }
  try {
    const h = await window.showSaveFilePicker!({
      suggestedName: 'typingRPG-save.json',
      types: [{ description: 'Typing RPG save', accept: { 'application/json': ['.json'] } }],
    });
    await idbSet('save-handle', h);
    return fileBackendFrom(h);
  } catch { return null; } // user cancelled the picker
}

// --- minimal IndexedDB key-value store (file handles survive reloads there) ---
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open('typingRPG', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const req = db.transaction('kv', 'readonly').objectStore('kv').get(key);
    req.onsuccess = () => res((req.result as T) ?? null);
    req.onerror = () => rej(req.error);
  });
}

async function idbSet(key: string, val: unknown): Promise<void> {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const req = db.transaction('kv', 'readwrite').objectStore('kv').put(val, key);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}
