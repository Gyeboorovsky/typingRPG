// Character select/manage screen: create, delete, and switch between up to
// MAX_CHARACTERS characters. DOM only — no game logic or persistence here;
// main.ts wires onPlay/onDelete into sim.ts + the save layer. No native
// browser popups (confirm/prompt) — everything is an in-panel state.
import { CLASSES } from '../game/classes';
import { MAX_CHARACTERS } from '../game/constants';
import type { ClassId, SaveData } from '../game/types';

const $ = (id: string): HTMLElement => document.getElementById(id)!;
const CLASS_ORDER: ClassId[] = ['warrior', 'ninja', 'wizard', 'priest'];

export class CharSelect {
  private els = {
    overlay: $('charselect'),
    slots: $('cs-slots'),
    openBtn: $('cs-open-btn'),
  };
  onPlay: (slot: number, existing: boolean, name?: string, classId?: ClassId) => void = () => {};
  onDelete: (slot: number) => void = () => {};
  onOpenRequested: () => void = () => {};
  /** Once true (a character has been chosen this session), the screen can be
   *  dismissed with Escape; the very first pick at boot cannot be skipped. */
  closable = false;
  private activeSlot = -1;
  private lastSaves: (SaveData | null)[] = [];
  private creatingSlot: number | null = null;
  private creatingClass: ClassId = 'warrior';
  private confirmDeleteSlot: number | null = null;

  constructor() {
    this.els.openBtn.addEventListener('click', () => this.onOpenRequested());
  }

  get isOpen(): boolean { return !this.els.overlay.classList.contains('hidden'); }

  setActiveSlot(slot: number): void { this.activeSlot = slot; }

  open(): void { this.els.overlay.classList.remove('hidden'); }

  close(): void {
    if (!this.closable) return;
    this.creatingSlot = null;
    this.confirmDeleteSlot = null;
    this.els.overlay.classList.add('hidden');
  }

  render(saves: (SaveData | null)[]): void {
    this.lastSaves = saves;
    const grid = this.els.slots;
    grid.innerHTML = '';
    for (let slot = 0; slot < MAX_CHARACTERS; slot++) {
      const save = saves[slot];
      const card = document.createElement('div');
      card.className = 'cs-card';
      if (save) this.renderOccupied(card, slot, save);
      else this.renderEmpty(card, slot);
      grid.appendChild(card);
    }
  }

  private rerender(): void { this.render(this.lastSaves); }

  private renderOccupied(card: HTMLDivElement, slot: number, save: SaveData): void {
    const isActive = slot === this.activeSlot;
    const name = escapeHtml(save.player.name || 'Hero');
    if (this.confirmDeleteSlot === slot) {
      card.innerHTML =
        `<div class="cs-name">Delete ${name}?</div>` +
        `<div class="cs-meta">This cannot be undone.</div>` +
        `<div class="cs-actions"><button class="cs-delete">Delete</button><button class="cs-cancel">Cancel</button></div>`;
      card.querySelector('.cs-delete')!.addEventListener('click', () => this.onDelete(slot));
      card.querySelector('.cs-cancel')!.addEventListener('click', () => { this.confirmDeleteSlot = null; this.rerender(); });
      return;
    }
    card.innerHTML =
      `<div class="cs-name">${name}${isActive ? ' <span class="cs-tag">active</span>' : ''}</div>` +
      `<div class="cs-meta">${CLASSES[save.player.classId].name} · Lv ${save.player.level}</div>` +
      `<div class="cs-actions">` +
      `<button class="cs-play">${isActive ? 'Resume' : 'Play'}</button>` +
      (isActive ? '' : '<button class="cs-delete">Delete</button>') +
      `</div>`;
    card.querySelector('.cs-play')!.addEventListener('click', () => {
      if (isActive) this.close();
      else this.onPlay(slot, true);
    });
    card.querySelector('.cs-delete')?.addEventListener('click', () => { this.confirmDeleteSlot = slot; this.rerender(); });
  }

  private renderEmpty(card: HTMLDivElement, slot: number): void {
    if (this.creatingSlot !== slot) {
      card.innerHTML = `<div class="cs-name">Empty slot</div><div class="cs-actions"><button class="cs-new">New Character</button></div>`;
      card.querySelector('.cs-new')!.addEventListener('click', () => {
        this.creatingSlot = slot;
        this.creatingClass = 'warrior';
        this.rerender();
      });
      return;
    }
    const classButtons = CLASS_ORDER.map((id) =>
      `<button class="cs-class${id === this.creatingClass ? ' selected' : ''}" data-class="${id}">${CLASSES[id].name}</button>`,
    ).join('');
    card.innerHTML =
      `<div class="cs-name">New Character</div>` +
      `<div class="cs-class-row">${classButtons}</div>` +
      `<input class="cs-input" maxlength="16" placeholder="Character name" />` +
      `<div class="cs-actions"><button class="cs-create">Create</button><button class="cs-cancel">Cancel</button></div>`;
    for (const btn of card.querySelectorAll<HTMLButtonElement>('.cs-class')) {
      btn.addEventListener('click', () => {
        this.creatingClass = btn.dataset.class as ClassId;
        this.rerender();
        card.querySelector<HTMLInputElement>('.cs-input')?.focus();
      });
    }
    const input = card.querySelector('.cs-input') as HTMLInputElement;
    input.focus();
    const create = (): void => this.onPlay(slot, false, input.value.trim().slice(0, 16) || 'Hero', this.creatingClass);
    card.querySelector('.cs-create')!.addEventListener('click', create);
    card.querySelector('.cs-cancel')!.addEventListener('click', () => { this.creatingSlot = null; this.rerender(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') create(); });
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
