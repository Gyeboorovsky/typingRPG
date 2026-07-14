// Keyboard capture. Arrows move (always), printable chars type (combat only),
// Enter fires the ult / respawns, Tab toggles the inventory (letters would
// collide with typing). Events are queued and drained into the sim each tick.
import type { Dir, InputEvent } from './game/types';

const DIR_KEYS: Record<string, Dir> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };

export class Input {
  private queue: InputEvent[] = [];
  private held: Dir[] = [];
  onToggleInventory: () => void = () => {};
  onCloseInventory: () => void = () => {};
  combatActive: () => boolean = () => false;

  constructor() {
    window.addEventListener('keydown', (e) => this.keydown(e));
    window.addEventListener('keyup', (e) => {
      const dir = DIR_KEYS[e.key];
      if (dir !== undefined) this.release(dir);
    });
    window.addEventListener('blur', () => { // don't leave keys stuck
      if (this.held.length) { this.held = []; this.pushMove(); }
    });
  }

  private keydown(e: KeyboardEvent): void {
    const dir = DIR_KEYS[e.key];
    if (dir !== undefined) {
      e.preventDefault();
      if (!e.repeat && !this.held.includes(dir)) { this.held.push(dir); this.pushMove(); }
      return;
    }
    if (e.key === 'Tab') { e.preventDefault(); this.onToggleInventory(); return; }
    if (e.key === 'Escape') { this.onCloseInventory(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      this.queue.push({ type: 'ult' }, { type: 'respawn' }); // sim picks whichever applies
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (this.combatActive()) e.preventDefault();
      this.queue.push({ type: 'char', ch: e.key });
    }
  }

  private release(dir: Dir): void {
    const i = this.held.indexOf(dir);
    if (i >= 0) { this.held.splice(i, 1); this.pushMove(); }
  }

  private pushMove(): void {
    this.queue.push({ type: 'move', dirs: [...this.held] });
  }

  push(ev: InputEvent): void {
    this.queue.push(ev);
  }

  drain(): InputEvent[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }
}
