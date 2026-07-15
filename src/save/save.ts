// Save orchestration: backend selection at boot, per-slot roster queries,
// autosave scheduling, and panic writes on tab hide/close.
import { AUTOSAVE_SECONDS, MAX_CHARACTERS } from '../game/constants';
import { makeSave } from '../game/sim';
import type { GameState, SaveData } from '../game/types';
import {
  isTauri, localBackend, localSaveSync, restoreFileBackend, tauriBackend,
} from './backends';
import type { SaveBackend } from './backends';

export class SaveManager {
  private backends: SaveBackend[] = [];
  private slot = 0;
  private sinceSave = 0;
  private saving = false;
  onStatus: (clean: boolean) => void = () => {};

  /** Pick backends once at boot (does not load anything yet). */
  async setup(): Promise<void> {
    if (isTauri()) {
      this.backends = [await tauriBackend()];
    } else {
      this.backends = [localBackend];
      const file = await restoreFileBackend();
      if (file) this.backends.push(file);
    }
  }

  /** The freshest save per slot, for the character-select screen. The
   *  user-picked file backend is excluded — it always shadows whichever
   *  slot is active, not a specific one. */
  async listSlots(): Promise<(SaveData | null)[]> {
    const slotBackends = this.backends.filter((b) => b.name !== 'file');
    const out: (SaveData | null)[] = [];
    for (let slot = 0; slot < MAX_CHARACTERS; slot++) {
      let best: SaveData | null = null;
      for (const b of slotBackends) {
        const d = await b.load(slot).catch(() => null);
        if ((d?.v === 1 || d?.v === 2) && (!best || d.savedAt > best.savedAt)) best = d;
      }
      out.push(best);
    }
    return out;
  }

  /** Load a slot and make it the active one for subsequent saves. */
  async loadSlot(slot: number): Promise<SaveData | null> {
    this.slot = slot;
    let best: SaveData | null = null;
    for (const b of this.backends) {
      const d = await b.load(slot).catch(() => null);
      if ((d?.v === 1 || d?.v === 2) && (!best || d.savedAt > best.savedAt)) best = d;
    }
    return best;
  }

  /** Make a slot active without loading (used right after creating a new character). */
  setActiveSlot(slot: number): void {
    this.slot = slot;
  }

  async deleteSlot(slot: number): Promise<void> {
    for (const b of this.backends) if (b.name !== 'file') await b.delete(slot).catch(() => {});
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
      await Promise.all(this.backends.map((b) => b.save(this.slot, d)));
      this.onStatus(true);
    } catch {
      state.dirty = true; // retry on the next autosave window
    } finally {
      this.saving = false;
    }
  }

  /** Best-effort flush when the page hides or closes, or before switching characters. */
  flush(state: GameState): void {
    const d = stamp(makeSave(state));
    if (!isTauri()) localSaveSync(this.slot, d); // synchronous — survives beforeunload
    for (const b of this.backends) if (b.name !== 'local') void b.save(this.slot, d);
    state.dirty = false;
    this.onStatus(true);
  }
}

const stamp = (d: SaveData): SaveData => ({ ...d, savedAt: new Date().toISOString() });
