// Save orchestration: backend selection at boot, autosave scheduling, and
// panic writes on tab hide/close.
import { AUTOSAVE_SECONDS } from '../game/constants';
import { makeSave } from '../game/sim';
import type { GameState, SaveData } from '../game/types';
import {
  isTauri, localBackend, localSaveSync, restoreFileBackend, tauriBackend,
} from './backends';
import type { SaveBackend } from './backends';

export class SaveManager {
  private backends: SaveBackend[] = [];
  private sinceSave = 0;
  private saving = false;
  onStatus: (clean: boolean) => void = () => {};

  /** Pick backends and return the freshest existing save, if any. */
  async init(): Promise<SaveData | null> {
    if (isTauri()) {
      this.backends = [await tauriBackend()];
    } else {
      this.backends = [localBackend];
      const file = await restoreFileBackend();
      if (file) this.backends.push(file);
    }
    let best: SaveData | null = null;
    for (const b of this.backends) {
      const d = await b.load().catch(() => null);
      if (d?.v === 1 && (!best || d.savedAt > best.savedAt)) best = d;
    }
    return best;
  }

  /** Swap in (or add) the user-picked file backend and write to it right away. */
  addFileBackend(b: SaveBackend, state: GameState): void {
    this.backends = this.backends.filter((x) => x.name !== 'file');
    this.backends.push(b);
    void this.saveNow(state);
  }

  hasFileBackend(): boolean {
    return this.backends.some((b) => b.name !== 'local');
  }

  /** Call once per frame with the simulated time; throttles disk writes. */
  tick(state: GameState, dt: number): void {
    if (!state.dirty) return;
    this.onStatus(false);
    this.sinceSave += dt;
    if (this.sinceSave >= AUTOSAVE_SECONDS) void this.saveNow(state);
  }

  async saveNow(state: GameState): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.sinceSave = 0;
    const d = stamp(makeSave(state));
    state.dirty = false;
    try {
      await Promise.all(this.backends.map((b) => b.save(d)));
      this.onStatus(true);
    } catch {
      state.dirty = true; // retry on the next autosave window
    } finally {
      this.saving = false;
    }
  }

  /** Best-effort flush when the page hides or closes. */
  flush(state: GameState): void {
    const d = stamp(makeSave(state));
    if (!isTauri()) localSaveSync(d); // synchronous — survives beforeunload
    for (const b of this.backends) if (b.name !== 'local') void b.save(d);
    state.dirty = false;
    this.onStatus(true);
  }
}

const stamp = (d: SaveData): SaveData => ({ ...d, savedAt: new Date().toISOString() });
