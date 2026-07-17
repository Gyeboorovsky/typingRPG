// Keyboard-buffer frontend for the cheat registry (Layer 2). A SECOND, fully passive `window`
// keydown listener that sits ALONGSIDE the Input class — it never touches Input, never calls
// preventDefault/stopPropagation. It only observes: buffers printable characters, asks the pure
// registry if a code completed, and if so emits a devCheat event onto the SAME input queue.
// A code char also reaching the game (moving the player, opening a window, typing in fight) is
// expected — this observer does not consume keystrokes.
import { recognize } from './cheats';
import type { InputEvent } from './game/types';
import { KeystrokeRingBuffer } from './keystroke-buffer';

export class CheatListener {
  private buffer = new KeystrokeRingBuffer(20);
  /** Observe only when a character is active (wired to !blocked) — so char-select name typing
   *  can't seed the buffer. */
  enabled: () => boolean = () => true;

  constructor(private emit: (ev: InputEvent) => void) {
    window.addEventListener('keydown', (e) => this.keydown(e));
  }

  /** Drop buffered keystrokes (called on character switch so a stale tail can't complete a code). */
  clearBuffer(): void { this.buffer.clear(); }

  private keydown(e: KeyboardEvent): void {
    if (!this.enabled()) return;
    // Ignore OS auto-repeat and shortcut chords, and only single printable characters — mirrors the
    // input layer's isPrintable so held keys / Ctrl+S etc. don't pollute the buffer.
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    this.buffer.push(e.key); // KeystrokeRingBuffer lowercases
    const hit = recognize(this.buffer.contents());
    if (hit) this.emit({ type: 'devCheat', code: hit.code, arg: hit.arg });
    // NOTE: intentionally no preventDefault/stopPropagation — 100% passive.
  }
}
