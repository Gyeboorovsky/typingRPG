// The three ways a save reaches disk:
//  - tauri: real files in %APPDATA%\com.gyeboorovsky.typingrpg\save-{slot}.json
//  - file:  a single real file the user picked via the File System Access API
//           (Chromium) — bound to whichever character is active, not slotted
//  - local: localStorage baseline, always written in the browser, one key per slot
import type { SaveData } from '../game/types';

export interface SaveBackend {
  readonly name: 'tauri' | 'file' | 'local';
  load(slot: number): Promise<SaveData | null>;
  save(slot: number, d: SaveData): Promise<void>;
  delete(slot: number): Promise<void>;
}

const LS_PREFIX = 'typingRPG.save.';

export const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;

// --- localStorage ---
export const localBackend: SaveBackend = {
  name: 'local',
  async load(slot) {
    const raw = localStorage.getItem(LS_PREFIX + slot);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  },
  async save(slot, d) { localStorage.setItem(LS_PREFIX + slot, JSON.stringify(d)); },
  async delete(slot) { localStorage.removeItem(LS_PREFIX + slot); },
};

/** Synchronous write for beforeunload, where async won't finish. */
export function localSaveSync(slot: number, d: SaveData): void {
  localStorage.setItem(LS_PREFIX + slot, JSON.stringify(d));
}

// --- Tauri fs plugin (dynamic import so web bundles never fetch it) ---
export async function tauriBackend(): Promise<SaveBackend> {
  const fs = await import('@tauri-apps/plugin-fs');
  const opts = { baseDir: fs.BaseDirectory.AppData };
  const fileOf = (slot: number): string => `save-${slot}.json`;
  return {
    name: 'tauri',
    async load(slot) {
      try { return JSON.parse(await fs.readTextFile(fileOf(slot), opts)) as SaveData; }
      catch { return null; }
    },
    async save(slot, d) {
      try { await fs.mkdir('', { ...opts, recursive: true }); } catch { /* already exists */ }
      await fs.writeTextFile(fileOf(slot), JSON.stringify(d, null, 2), opts);
    },
    async delete(slot) {
      try { await fs.remove(fileOf(slot), opts); } catch { /* already gone */ }
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

/** Bound to one physical file the user picked — slot is ignored, it always
 *  tracks whichever character is currently active. */
function fileBackendFrom(h: FileSystemFileHandle): SaveBackend {
  return {
    name: 'file',
    async load() {
      try {
        const text = await (await h.getFile()).text();
        return text.trim() ? (JSON.parse(text) as SaveData) : null;
      } catch { return null; }
    },
    async save(_slot, d) {
      const w = await h.createWritable();
      await w.write(JSON.stringify(d, null, 2));
      await w.close();
    },
    async delete() { /* user owns this file; nothing to do */ },
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
