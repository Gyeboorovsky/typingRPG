// A tiny fixed-capacity FIFO of recently typed characters. Generic and reusable — knows
// nothing about cheats. The 21st push (at the default cap) evicts the oldest character.
// No time-based debounce/timeout/reset: a suffix may be completed across an arbitrarily long
// span as long as no more than `capacity` characters land before it finishes.
export class KeystrokeRingBuffer {
  private buf = '';
  constructor(private readonly capacity = 20) {}

  /** Append one character, lowercased (so "HESOYAM" and "hesoyam" match the same suffix). */
  push(ch: string): void {
    this.buf = (this.buf + ch.toLowerCase()).slice(-this.capacity);
  }

  contents(): string { return this.buf; }
  endsWith(suffix: string): boolean { return this.buf.endsWith(suffix); }
  clear(): void { this.buf = ''; }
}
