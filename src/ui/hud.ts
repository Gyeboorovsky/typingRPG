// DOM HUD overlay: bars, typing prompt, boss bar, toasts, inventory, the
// draggable statistics/attributes window, death screen. Reads state each
// frame but only touches the DOM when values change.
import { maxHp, maxMp, playerAttributes, STAT_IDS } from '../game/attributes';
import type { AttributeId, StatId } from '../game/attributes';
import { classOf } from '../game/classes';
import { radiusFor } from '../game/combat';
import { INV_PAGE_H, INV_W, XP_CURVE } from '../game/constants';
import { firstFreeCell, ITEMS, itemSize, rectFree } from '../game/items';
import { MOBS } from '../game/mobs';
import type { EquipSlot, Fx, GameState, ItemStack, Player } from '../game/types';
import type { Keymap } from '../keybinds';
import { topmostWindow } from './windows';
import type { WindowId } from './windows';

const $ = (id: string): HTMLElement => document.getElementById(id)!;

const ATTR_IDS: AttributeId[] = ['health', 'energy', 'defense', 'physicalDamage', 'magicDamage', 'movementSpeed', 'dodge', 'attackSpeed'];

// Human labels for the tooltip's attribute-bonus lines.
const ATTR_LABEL: Record<AttributeId, string> = {
  health: 'Health', energy: 'Energy', defense: 'Defense',
  physicalDamage: 'Physical dmg', magicDamage: 'Magic dmg',
  movementSpeed: 'Move speed', dodge: 'Dodge', attackSpeed: 'Attack speed',
};

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// A live drag session (grid item being repositioned/equipped, or a worn item unequipped).
type DragSource =
  | { kind: 'grid'; index: number; st: ItemStack & { x: number; y: number } }
  | { kind: 'equip'; slot: EquipSlot; st: ItemStack };
interface DragState {
  source: DragSource;
  // 'drag' = hold-move-release. 'carry' = a plain click stuck the item to the
  // cursor; it travels with the pointer (page tabs stay usable) until the next
  // click places it, or Esc / right-click / clicking its own cell cancels.
  mode: 'drag' | 'carry';
  el: HTMLElement;          // the origin tile (dimmed while dragging)
  ghost: HTMLElement | null;
  grabDX: number; grabDY: number; // pointer offset within the tile at grab time
  w: number; h: number;    // footprint in cells
  started: boolean;        // crossed the move threshold → real drag, not a click
  startX: number; startY: number;
  // Cached once per drag so pointermove never forces a style recalc/layout.
  // (Resizing the window mid-drag offsets the outline until the next drag.)
  cell: number; gap: number;      // grid cell/gap px (getComputedStyle at grab)
  gridRect: DOMRect | null;       // inv-grid bounds, captured when the drag starts
}

// Faded placeholder glyph + label shown in an empty paperdoll slot.
const SLOT_GLYPH: Record<EquipSlot, string> =
  { weapon: '🗡️', armor: '🛡️', helmet: '⛑️', boots: '🥾', necklace: '📿', ring: '💍' };
const SLOT_LABEL: Record<EquipSlot, string> =
  { weapon: 'Weapon', armor: 'Armor', helmet: 'Helmet', boots: 'Boots', necklace: 'Necklace', ring: 'Ring' };

/** The options window's view, attached by main.ts. Hud owns open/close + z-order;
 *  the view owns the body content and re-renders from the live keymap on open. */
interface OptionsView { render(keymap: Keymap): void; cancelCapture(): void }

export class Hud {
  private els = {
    hpFill: $('hp-fill'), hpText: $('hp-text'),
    mpFill: $('mp-fill'), mpText: $('mp-text'),
    xpText: $('xp-text'),
    lvlFills: [0, 1, 2, 3].map((i) => $(`lvl-c${i}`)),
    statsBtn: $('stats-btn'),
    promptBox: $('prompt-box'), prompt: $('prompt'), promptTag: $('prompt-tag'),
    pDone: $('p-done'), pCur: $('p-cur'), pRest: $('p-rest'),
    streak: $('streak'), radius: $('radius'), ultHint: $('ult-hint'),
    bossbar: $('bossbar'), bossName: $('boss-name'), bossFill: $('boss-fill'), bossBanner: $('boss-banner'),
    toasts: $('toasts'), inventory: $('inventory'), invGrid: $('inv-grid'),
    invClose: $('inv-close-btn'), invGoldVal: $('inv-gold-val'), invOverflow: $('inv-overflow'),
    invPageBtns: Array.from(document.querySelectorAll<HTMLButtonElement>('.inv-page-btn')),
    equipSlots: Array.from(document.querySelectorAll<HTMLElement>('.eq-slot')),
    statspanel: $('statspanel'), statsHeader: $('stats-header'),
    statsOpenBtn: $('stats-open-btn'), statsCloseBtn: $('stats-close-btn'),
    statPointsLeft: $('stat-points-left'),
    statVals: Object.fromEntries(STAT_IDS.map((s) => [s, $(`stat-val-${s}`)])) as Record<StatId, HTMLElement>,
    statPlusBtns: Array.from(document.querySelectorAll<HTMLButtonElement>('.stat-plus')),
    attrVals: Object.fromEntries(ATTR_IDS.map((a) => [a, $(`attr-val-${a}`)])) as Record<AttributeId, HTMLElement>,
    death: $('death'), saveDot: $('save-dot'),
    options: $('options'), optionsClose: $('options-close-btn'),
  };
  private invOpen = false;
  private invPage = 0; // visible bag page (0-based; tabs I/II/III)
  private statsOpen = false;
  private optionsOpen = false;
  private openOrder: WindowId[] = []; // currently-open windows in open order (Esc closes topmost)
  private options: OptionsView | null = null;
  private lastInvRev = -1;
  private lastFlash = 0;
  private cache: Record<string, string | number | boolean> = {};
  private state: GameState | null = null; // latest synced state, read by drag/right-click/tooltip
  private drag: DragState | null = null;
  private tip: HTMLElement;               // custom hover tooltip (appended to <body>)
  // Tooltip render cache: rebuild innerHTML + measure only when the hovered
  // stack (or its qty — pickups can grow it mid-hover) changes, not per move.
  private tipStack: ItemStack | null = null;
  private tipQty = 0;
  private tipW = 0; private tipH = 0;
  private outline: HTMLElement;           // drop-target footprint indicator inside the grid
  private hiSlot: HTMLElement | null = null; // equip slot currently drop-highlighted
  onAllocateStat: (stat: StatId) => void = () => {};
  onEquip: (index: number) => void = () => {};
  onUnequip: (slot: EquipSlot, x?: number, y?: number) => void = () => {};
  onMoveItem: (index: number, x: number, y: number) => void = () => {};
  onUseItem: (index: number) => void = () => {};
  onDropItem: (index: number) => void = () => {};

  constructor() {
    this.els.statsBtn.addEventListener('click', () => this.statsOpen ? this.closeStats() : this.openStats());
    this.els.statsOpenBtn.addEventListener('click', () => this.statsOpen ? this.closeStats() : this.openStats());
    this.els.statsCloseBtn.addEventListener('click', () => this.closeStats());
    for (const btn of this.els.statPlusBtns) {
      btn.addEventListener('click', () => this.onAllocateStat(btn.dataset.stat as StatId));
    }
    this.els.invClose.addEventListener('click', () => this.closeInventory());
    this.els.optionsClose.addEventListener('click', () => this.closeOptions());
    for (const btn of this.els.invPageBtns) {
      btn.addEventListener('click', () => this.setInvPage(Number(btn.dataset.page)));
    }

    // Floating tooltip + grid drop-outline, created once and reused.
    this.tip = document.createElement('div');
    this.tip.className = 'item-tooltip hidden';
    document.body.appendChild(this.tip);
    this.outline = document.createElement('div');
    this.outline.className = 'drop-outline hidden';

    for (const el of this.els.equipSlots) {
      const slot = el.dataset.slot as EquipSlot;
      // double-click a worn item to send it back to the bag (kept from A3)
      el.addEventListener('dblclick', () => { if (el.classList.contains('filled')) this.tryUnequip(slot); });
      // right-click a worn item to unequip it
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (el.classList.contains('filled')) this.tryUnequip(slot);
      });
      // drag a worn item out to the grid to unequip
      el.addEventListener('pointerdown', (e) => {
        const st = this.state?.player.equipment[slot];
        if (st) this.beginDrag(e, el, { kind: 'equip', slot, st });
      });
      el.addEventListener('pointermove', (e) => this.showSlotTip(e, slot));
      el.addEventListener('pointerleave', () => this.hideTooltip());
    }
    this.initDrag();
  }

  /** Drag the character window by its header; position is clamped to stay on screen. */
  private initDrag(): void {
    const panel = this.els.statspanel, header = this.els.statsHeader;
    let dragging = false, dx = 0, dy = 0;
    header.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return; // let the close button handle its own click
      dragging = true;
      header.classList.add('dragging');
      header.setPointerCapture(e.pointerId);
      const r = panel.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
    });
    header.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const maxX = window.innerWidth - panel.offsetWidth;
      const maxY = window.innerHeight - panel.offsetHeight;
      panel.style.left = `${Math.max(0, Math.min(maxX, e.clientX - dx))}px`;
      panel.style.top = `${Math.max(0, Math.min(maxY, e.clientY - dy))}px`;
    });
    const stop = (): void => { dragging = false; header.classList.remove('dragging'); };
    header.addEventListener('pointerup', stop);
    header.addEventListener('pointercancel', stop);
  }

  /** Set textContent/width only when the value changed since last frame. */
  private set(key: string, value: string | number | boolean, apply: () => void): void {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    apply();
  }

  sync(state: GameState, fx: Fx[]): void {
    this.state = state;
    const p = state.player;
    const e = this.els;
    const mhp = maxHp(p), mmp = maxMp(p), need = XP_CURVE(p.level);

    // key includes the max so a maxHp/maxMp change (VIT/INT or gear) refreshes the bar
    this.set('hp', `${Math.ceil(p.hp)}/${mhp}`, () => {
      e.hpFill.style.width = `${(p.hp / mhp) * 100}%`;
      e.hpText.textContent = `${Math.ceil(p.hp)} / ${mhp}`;
    });
    this.set('mp', `${Math.floor(p.mp)}/${mmp}`, () => {
      e.mpFill.style.width = `${(p.mp / mmp) * 100}%`;
      e.mpText.textContent = `${Math.floor(p.mp)} / ${mmp}`;
    });
    this.set('xp', p.level, () => { e.xpText.textContent = `Lv ${p.level}`; });
    // 4 segments = the exp bar itself (one per 25% = one stat point), each fills like a normal bar
    this.set('lvlcircles', `${p.level}:${Math.round((p.xp / need) * 400)}`, () => {
      const progress = (p.xp / need) * 4;
      e.lvlFills.forEach((fill, i) => {
        const frac = Math.max(0, Math.min(1, progress - i));
        fill.style.width = `${frac * 100}%`;
        fill.style.boxShadow = frac > 0.05 ? `0 0 ${2 + frac * 8}px ${frac * 4}px var(--xp)` : 'none';
      });
    });
    this.set('statpoints', p.statPoints, () => {
      e.statsBtn.classList.toggle('hidden', p.statPoints <= 0);
      e.statsBtn.textContent = `+${p.statPoints}`;
    });
    if (this.statsOpen) this.syncStats(p);

    const c = state.combat;
    this.set('combat', !!c, () => e.promptBox.classList.toggle('hidden', !c));
    if (c) {
      // Practice (no-target) sessions get a distinct frame + a "no target" tag.
      this.set('practice', c.practice, () => {
        e.promptBox.classList.toggle('practice', c.practice);
        e.promptTag.classList.toggle('hidden', !c.practice);
        e.promptTag.textContent = c.practice ? 'PRACTICE — no target' : '';
      });
      this.set('prompt', `${c.prompt}:${c.typed}`, () => {
        e.pDone.textContent = c.prompt.slice(0, c.typed);
        const cur = c.prompt[c.typed] ?? '';
        e.pCur.textContent = cur === ' ' ? ' ' : cur;
        e.pRest.textContent = c.prompt.slice(c.typed + 1);
      });
      this.set('streak', c.streak, () => {
        e.streak.innerHTML = `Streak <b>${c.streak}</b>`;
      });
      this.set('radius', radiusFor(c.streak).toFixed(2), () => {
        e.radius.textContent = `AoE ${radiusFor(c.streak).toFixed(1)} tiles`;
      });
      if (c.errorFlash > this.lastFlash) { // fresh typo → retrigger shake
        e.prompt.classList.remove('shake');
        void e.prompt.offsetWidth;
        e.prompt.classList.add('shake');
      } else if (c.errorFlash <= 0) {
        e.prompt.classList.remove('shake');
      }
      this.lastFlash = c.errorFlash;

      const ult = classOf(p).ult;
      const ready = c.streak >= ult.streakThreshold && !c.practice; // ult is blocked without a real target
      let hint = '';
      if (ready) {
        if (p.ultCooldown > 0) hint = `${ult.name} — cooling ${p.ultCooldown.toFixed(1)}s`;
        else if (p.mp < ult.manaCost) hint = `${ult.name} — need ${ult.manaCost} MP`;
        else hint = `ENTER — ${ult.name} (${ult.manaCost} MP)`;
      }
      this.set('ult', hint, () => {
        e.ultHint.classList.toggle('hidden', hint === '');
        e.ultHint.textContent = hint;
      });
    }

    // boss bar while a boss is engaged (no array alloc — this runs every frame)
    const boss = state.mobs.find((m) => m.state === 'aggro' && MOBS[m.defId].boss);
    this.set('boss', boss ? `${boss.hp}:${boss.shield}` : '', () => {
      e.bossbar.classList.toggle('hidden', !boss);
      if (boss) {
        const def = MOBS[boss.defId];
        e.bossName.textContent = def.name;
        e.bossFill.style.width = `${(boss.hp / def.hp) * 100}%`;
        e.bossBanner.classList.toggle('hidden', !boss.shield);
        e.bossBanner.textContent = boss.shield ? 'SHIELD — type one flawless phrase!' : '';
      }
    });

    this.set('dead', p.dead, () => e.death.classList.toggle('hidden', !p.dead));

    this.set('gold', p.gold, () => { e.invGoldVal.textContent = String(p.gold); });
    this.set('overflow', p.overflow.length, () => {
      const n = p.overflow.length;
      e.invOverflow.classList.toggle('hidden', n === 0);
      e.invOverflow.textContent = n ? `${n} item${n > 1 ? 's' : ''} didn't fit` : '';
    });

    // Defer rebuilds while a drag is in flight so the tile being dragged isn't
    // yanked out from under the pointer (e.g. loot picked up mid-drag).
    if (this.invOpen && p.invRev !== this.lastInvRev && !this.drag) this.rebuildInventory(state);

    for (const f of fx) {
      if (f.kind === 'pickup') this.toast(f.text);
      else if (f.kind === 'levelup') this.toast(`⭐ Level ${f.level}!`);
    }
  }

  /** Register the options window's view (built in main.ts with its rebind callbacks). */
  attachOptions(view: OptionsView): void { this.options = view; }

  private markOpen(id: WindowId): void { if (!this.openOrder.includes(id)) this.openOrder.push(id); }
  private markClosed(id: WindowId): void {
    const i = this.openOrder.indexOf(id);
    if (i >= 0) this.openOrder.splice(i, 1);
  }

  toggleInventory(state: GameState): void {
    if (this.drag?.mode === 'carry') { this.endCarry(); return; } // Tab first releases the carried item
    this.invOpen = !this.invOpen;
    this.els.inventory.classList.toggle('hidden', !this.invOpen);
    if (this.invOpen) { this.markOpen('inventory'); this.rebuildInventory(state); }
    else this.markClosed('inventory');
  }

  /** Is any HUD window open (inventory / character / options) or an item mid-carry? Drives Esc
   *  precedence: Esc closes the topmost window before it does anything else. */
  anyWindowOpen(): boolean {
    return this.invOpen || this.statsOpen || this.optionsOpen || this.drag?.mode === 'carry';
  }

  /** Close the topmost open window — options always wins, else the last-opened (LIFO). */
  closeTopWindow(): void {
    const top = topmostWindow(this.openOrder);
    if (top === 'options') this.closeOptions();
    else if (top === 'character') this.closeStats();
    else if (top === 'inventory') this.closeInventory();
  }

  closeInventory(): void {
    if (this.drag?.mode === 'carry') { this.endCarry(); return; } // Esc/X first releases the carried item
    this.invOpen = false;
    this.markClosed('inventory');
    this.els.inventory.classList.add('hidden');
    this.hideTooltip();
  }

  toggleStats(): void {
    this.statsOpen ? this.closeStats() : this.openStats();
  }

  openStats(): void {
    this.statsOpen = true;
    this.markOpen('character');
    this.els.statspanel.classList.remove('hidden');
  }

  closeStats(): void {
    this.statsOpen = false;
    this.markClosed('character');
    this.els.statspanel.classList.add('hidden');
  }

  openOptions(keymap: Keymap): void {
    this.optionsOpen = true;
    this.markOpen('options');
    this.els.options.classList.remove('hidden');
    this.options?.render(keymap);
  }

  closeOptions(): void {
    this.optionsOpen = false;
    this.markClosed('options');
    this.options?.cancelCapture(); // don't leave a "press a key…" listener armed
    this.els.options.classList.add('hidden');
  }

  private syncStats(p: GameState['player']): void {
    this.els.statPointsLeft.textContent = `(${p.statPoints} to spend)`;
    for (const stat of STAT_IDS) {
      this.els.statVals[stat].textContent = String(p.stats[stat]);
    }
    for (const btn of this.els.statPlusBtns) btn.disabled = p.statPoints <= 0;

    const attrs = playerAttributes(p);
    for (const attr of ATTR_IDS) {
      const v = attrs[attr];
      this.els.attrVals[attr].textContent = attr === 'dodge' ? `${v.toFixed(1)}%` : String(Math.round(v));
    }
  }

  setSaveStatus(clean: boolean): void {
    this.els.saveDot.classList.toggle('dirty', !clean);
    this.els.saveDot.title = clean ? 'saved' : 'saving…';
  }

  private rebuildInventory(state: GameState): void {
    this.lastInvRev = state.player.invRev;
    this.renderGrid(state.player);
    this.renderEquipment(state.player);
  }

  /** Switch the visible bag page (tabs I/II/III). Allowed while CARRYING an item —
   *  that is how items travel between pages — but locked during a hold-drag, where
   *  the pointer is down and the outline math must stay on the origin page. */
  private setInvPage(page: number): void {
    if (page === this.invPage) return;
    if (this.drag && this.drag.mode !== 'carry') return;
    this.invPage = page;
    if (this.state) this.rebuildInventory(this.state);
  }

  /** Redraw the positioned grid: a backdrop of empty cells, then each item on the
   *  current page drawn across its w×h footprint. Items are draggable (reposition /
   *  equip), double- or right-clickable (quick-equip / use), and show a hover tooltip. */
  private renderGrid(p: Player): void {
    const grid = this.els.invGrid;
    grid.innerHTML = '';
    for (let i = 0; i < INV_W * INV_PAGE_H; i++) {
      const cell = document.createElement('div');
      cell.className = 'inv-cell';
      // Explicit placement — auto-placed cells would flow AROUND the explicitly
      // placed item tiles and spill into phantom rows below the grid.
      cell.style.gridColumn = String((i % INV_W) + 1);
      cell.style.gridRow = String(Math.floor(i / INV_W) + 1);
      grid.appendChild(cell);
    }
    const rowOff = this.invPage * INV_PAGE_H;
    p.inventory.forEach((st, index) => {
      if (Math.floor(st.y / INV_PAGE_H) !== this.invPage) return; // other page
      const tile = this.itemTile(st);
      const s = itemSize(ITEMS[st.defId]);
      tile.style.gridColumn = `${st.x + 1} / span ${s.w}`;
      tile.style.gridRow = `${st.y - rowOff + 1} / span ${s.h}`;
      // a carried item keeps its dimmed origin tile across page-switch rebuilds
      if (this.drag?.mode === 'carry' && this.drag.source.kind === 'grid' && this.drag.source.index === index) {
        tile.classList.add('dragging-src');
        this.drag.el = tile; // rebuild replaced the element endCarry() will un-dim
      }
      tile.addEventListener('dblclick', () => this.tryEquip(index, st, tile));
      tile.addEventListener('contextmenu', (e) => { e.preventDefault(); this.quickAction(tile, index, st); });
      tile.addEventListener('pointerdown', (e) => this.beginDrag(e, tile, { kind: 'grid', index, st }));
      tile.addEventListener('pointermove', (e) => this.showItemTip(e, st));
      tile.addEventListener('pointerleave', () => this.hideTooltip());
      grid.appendChild(tile);
    });
    for (const btn of this.els.invPageBtns)
      btn.classList.toggle('active', Number(btn.dataset.page) === this.invPage);
    grid.appendChild(this.outline); // re-attach after innerHTML wipe; stays hidden until a drag
  }

  /** Fill each paperdoll slot with its worn item, or a faded placeholder glyph. */
  private renderEquipment(p: Player): void {
    for (const el of this.els.equipSlots) {
      const slot = el.dataset.slot as EquipSlot;
      const st = p.equipment[slot];
      if (st) {
        const def = ITEMS[st.defId];
        el.className = `eq-slot filled t${def?.tier ?? 1}`;
        if (this.drag?.mode === 'carry' && this.drag.source.kind === 'equip' && this.drag.source.slot === slot) {
          el.classList.add('dragging-src'); // carried worn item stays dimmed across rebuilds
          this.drag.el = el;
        }
        el.removeAttribute('title'); // rich hover comes from the custom tooltip now
        el.innerHTML = `<span class="item-icon">${def?.icon ?? '❔'}</span>` +
          (st.plus && st.plus > 0 ? `<span class="plus">+${st.plus}</span>` : '');
      } else {
        el.className = 'eq-slot';
        el.title = SLOT_LABEL[slot];
        el.innerHTML = `<span class="eq-ph">${SLOT_GLYPH[slot]}</span>`;
      }
    }
  }

  /** A single grid item tile: tier-colored, emoji icon, quantity + upgrade badges.
   *  Hover detail comes from the custom tooltip, not a native title. */
  private itemTile(st: ItemStack): HTMLElement {
    const def = ITEMS[st.defId];
    const tile = document.createElement('div');
    tile.className = `item t${def?.tier ?? 1}`;
    tile.style.touchAction = 'none'; // let pointer drag own the gesture on touch
    const hasPlus = !!st.plus && st.plus > 0;
    tile.innerHTML = `<span class="item-icon">${def?.icon ?? '❔'}</span>` +
      (st.qty > 1 ? `<span class="qty">${st.qty}</span>` : '') +
      (hasPlus ? `<span class="plus">+${st.plus}</span>` : '');
    return tile;
  }

  // ---- drag & drop (pointer events; all mutations go through A2 events) ----

  private cellPx(): number { return parseFloat(getComputedStyle(this.els.inventory).getPropertyValue('--cell')) || 50; }
  private gapPx(): number { return parseFloat(getComputedStyle(this.els.inventory).getPropertyValue('--gap')) || 5; }
  private slotEl(slot: EquipSlot): HTMLElement {
    return this.els.equipSlots.find((el) => el.dataset.slot === slot)!;
  }

  /** Arm a drag from a grid tile or equip slot. The real drag (ghost + drop feedback)
   *  only begins once the pointer crosses a small threshold, so plain clicks still
   *  reach the double-click / right-click handlers. Left button only. */
  private beginDrag(e: PointerEvent, el: HTMLElement, source: DragSource): void {
    if (e.button !== 0 || this.drag) return;
    const s = itemSize(ITEMS[source.st.defId]);
    const r = el.getBoundingClientRect();
    this.drag = {
      source, mode: 'drag', el, ghost: null,
      grabDX: e.clientX - r.left, grabDY: e.clientY - r.top,
      w: s.w, h: s.h, started: false, startX: e.clientX, startY: e.clientY,
      cell: this.cellPx(), gap: this.gapPx(), gridRect: null,
    };
    this.hideTooltip();
    window.addEventListener('pointermove', this.onDragMove);
    window.addEventListener('pointerup', this.onDragUp);
  }

  private onDragMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
      d.started = true;
      this.startGhost(d);
      document.body.style.userSelect = 'none';
    }
    e.preventDefault();
    if (d.ghost) {
      d.ghost.style.left = `${e.clientX - d.grabDX}px`;
      d.ghost.style.top = `${e.clientY - d.grabDY}px`;
    }
    this.updateDropFeedback(e.clientX, e.clientY);
  };

  private onDragUp = (e: PointerEvent): void => {
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerup', this.onDragUp);
    const d = this.drag;
    if (!d) return;
    if (!d.started) { this.enterCarry(d); return; } // plain click → item sticks to the cursor
    this.drag = null;
    this.clearDropFeedback();
    document.body.style.userSelect = '';
    d.ghost?.remove();
    d.el.classList.remove('dragging-src');

    const target = this.resolveDrop(e.clientX, e.clientY, d);
    if (d.source.kind === 'grid') {
      if (target.type === 'equip') this.tryEquipTo(d.source.index, d.source.st, target.slot);
      else if (target.type === 'grid') this.tryMove(d.source, target.x, target.y, d.w, d.h, d.el);
      else if (target.type === 'world') this.onDropItem(d.source.index); // throw to the ground
      else this.shakeEl(d.el); // dropped on some UI but nowhere useful
    } else {
      if (target.type === 'grid') this.tryUnequip(d.source.slot, target.x, target.y);
      else this.shakeEl(d.el); // can't move a worn item straight to another slot
    }
  };

  // ---- click-to-carry (Metin2-style): click picks the item up, next click places it ----

  /** A click (no hold-move) grabbed the item: keep the drag session alive, show the
   *  ghost on the cursor, and wait for the next pointerdown to place it. Page tabs
   *  remain clickable, so this is how items travel between bag pages. */
  private enterCarry(d: DragState): void {
    d.mode = 'carry';
    d.started = true;
    this.startGhost(d);
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', this.onDragMove);
    window.addEventListener('pointerdown', this.onCarryDown);
  }

  /** Placement click while carrying. On an invalid spot the item stays on the
   *  cursor; clicking its own cell/slot cancels (which also lets dblclick fire). */
  private onCarryDown = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || d.mode !== 'carry') return;
    if (e.button !== 0) return; // right-click cancels via quickAction, not here
    const target = this.resolveDrop(e.clientX, e.clientY, d);
    const src = d.source;
    if (src.kind === 'grid') {
      if (target.type === 'equip') {
        const v = this.equipValidity(src.index, src.st, target.slot);
        if (v.ok) { this.endCarry(); this.onEquip(src.index); }
        else { this.shakeEl(this.slotEl(target.slot)); this.toast(v.reason!); }
      } else if (target.type === 'grid') {
        if (target.x === src.st.x && target.y === src.st.y) { this.endCarry(); return; } // back home (dblclick path)
        const others = this.state!.player.inventory.filter((_, i) => i !== src.index);
        if (rectFree(others, target.x, target.y, d.w, d.h)) {
          this.endCarry();
          this.onMoveItem(src.index, target.x, target.y);
        } // blocked cell: outline is already red — keep carrying
      } else if (target.type === 'world') {
        this.endCarry();
        this.onDropItem(src.index); // throw to the ground
      } // window chrome (page tabs, footer…): keep carrying
    } else {
      if (target.type === 'grid') {
        if (rectFree(this.state!.player.inventory, target.x, target.y, d.w, d.h)) {
          this.endCarry();
          this.onUnequip(src.slot, target.x, target.y);
        }
      } else if (target.type === 'equip' && target.slot === src.slot) {
        this.endCarry(); // back on its own slot (dblclick-unequip path)
      } // anything else: keep carrying the worn item
    }
  };

  /** Tear down a carry (or cancel it — the item never left its cell, so there is
   *  nothing to undo beyond the cursor ghost and the dimmed origin tile). */
  private endCarry(): void {
    const d = this.drag;
    if (!d) return;
    window.removeEventListener('pointermove', this.onDragMove);
    window.removeEventListener('pointerdown', this.onCarryDown);
    this.drag = null;
    this.clearDropFeedback();
    document.body.style.userSelect = '';
    d.ghost?.remove();
    d.el.classList.remove('dragging-src');
  }

  private startGhost(d: DragState): void {
    const cell = d.cell, gap = d.gap;
    d.gridRect = this.els.invGrid.getBoundingClientRect();
    const g = d.el.cloneNode(true) as HTMLElement;
    g.classList.add('drag-ghost');
    g.classList.remove('dragging-src', 'drop-ok', 'drop-bad');
    g.style.width = `${d.w * cell + (d.w - 1) * gap}px`;
    g.style.height = `${d.h * cell + (d.h - 1) * gap}px`;
    g.style.gridColumn = ''; g.style.gridRow = '';
    g.style.left = `${d.startX - d.grabDX}px`;
    g.style.top = `${d.startY - d.grabDY}px`;
    document.body.appendChild(g);
    d.ghost = g;
    d.el.classList.add('dragging-src');
  }

  /** Which drop target the pointer is over: an equip slot, a clamped top-left grid
   *  cell, the open world (canvas → throw to ground), or other UI (nothing). */
  private resolveDrop(px: number, py: number, d: DragState):
    { type: 'equip'; slot: EquipSlot } | { type: 'grid'; x: number; y: number }
    | { type: 'world' } | { type: 'none' } {
    const el = document.elementFromPoint(px, py) as HTMLElement | null;
    if (!el) return { type: 'none' };
    // #hud is pointer-events:none, so the bare canvas means the pointer is over
    // the world itself — not some other panel (stats, bars) floating above it.
    if (el.id === 'game') return { type: 'world' };
    const slotEl = el.closest('.eq-slot') as HTMLElement | null;
    if (slotEl?.dataset.slot) return { type: 'equip', slot: slotEl.dataset.slot as EquipSlot };
    if (el.closest('#inv-grid')) {
      const r = d.gridRect ?? this.els.invGrid.getBoundingClientRect();
      const pitch = d.cell + d.gap;
      const gx = Math.max(0, Math.min(INV_W - d.w, Math.round((px - d.grabDX - r.left) / pitch)));
      const gy = Math.max(0, Math.min(INV_PAGE_H - d.h, Math.round((py - d.grabDY - r.top) / pitch)));
      return { type: 'grid', x: gx, y: gy + this.invPage * INV_PAGE_H }; // absolute bag coords
    }
    return { type: 'none' };
  }

  /** Live valid/invalid highlight under the pointer while dragging. */
  private updateDropFeedback(px: number, py: number): void {
    const d = this.drag;
    if (!d?.started) return;
    this.clearDropFeedback();
    const t = this.resolveDrop(px, py, d);
    const p = this.state!.player;
    const src = d.source;
    if (t.type === 'equip') {
      const slotEl = this.slotEl(t.slot);
      const ok = src.kind === 'grid' && this.equipValidity(src.index, src.st, t.slot).ok;
      slotEl.classList.add(ok ? 'drop-ok' : 'drop-bad');
      this.hiSlot = slotEl;
    } else if (t.type === 'grid') {
      const ok = src.kind === 'grid'
        ? rectFree(p.inventory.filter((_, i) => i !== src.index), t.x, t.y, d.w, d.h)
        : !!firstFreeCell(p.inventory, d.w, d.h);
      this.showOutline(t.x, t.y - this.invPage * INV_PAGE_H, d.w, d.h, ok); // outline is page-local
    }
  }

  private clearDropFeedback(): void {
    if (this.hiSlot) { this.hiSlot.classList.remove('drop-ok', 'drop-bad'); this.hiSlot = null; }
    this.outline.classList.add('hidden');
  }

  private showOutline(x: number, y: number, w: number, h: number, ok: boolean): void {
    const cell = this.drag?.cell ?? this.cellPx(), gap = this.drag?.gap ?? this.gapPx();
    const o = this.outline;
    o.classList.remove('hidden');
    o.classList.toggle('bad', !ok);
    o.style.left = `${x * (cell + gap)}px`;
    o.style.top = `${y * (cell + gap)}px`;
    o.style.width = `${w * cell + (w - 1) * gap}px`;
    o.style.height = `${h * cell + (h - 1) * gap}px`;
  }

  // ---- equip / unequip / move / use, each pre-checked so the sim never silently no-ops ----

  /** Can inventory[index] go into `slot`? Mirrors sim.equipItem's guards (v4-2). */
  private equipValidity(index: number, st: ItemStack, slot: EquipSlot): { ok: boolean; reason?: string } {
    const p = this.state!.player;
    const def = ITEMS[st.defId];
    if (!def?.slot) return { ok: false, reason: 'Not equippable' };
    if (def.slot !== slot) return { ok: false, reason: `${cap(def.slot)} slot only` };
    if (p.level < (def.reqLevel ?? 0)) return { ok: false, reason: `Requires level ${def.reqLevel}` };
    const prev = p.equipment[slot];
    if (prev) { // the swapped-out item needs a free cell (excluding the incoming item)
      const ps = itemSize(ITEMS[prev.defId]);
      if (!firstFreeCell(p.inventory.filter((_, i) => i !== index), ps.w, ps.h))
        return { ok: false, reason: 'No room to swap' };
    }
    return { ok: true };
  }

  /** Quick-equip (double-click / right-click gear): equip into the item's own slot. */
  private tryEquip(index: number, st: ItemStack, el: HTMLElement): void {
    const def = ITEMS[st.defId];
    if (!def?.slot) return;
    const v = this.equipValidity(index, st, def.slot);
    if (!v.ok) { this.shakeEl(el); this.toast(v.reason!); return; }
    this.onEquip(index);
  }

  /** Drag-equip into a specific slot; wrong slot / under-level shakes that slot + toasts. */
  private tryEquipTo(index: number, st: ItemStack, slot: EquipSlot): void {
    const v = this.equipValidity(index, st, slot);
    if (!v.ok) { this.shakeEl(this.slotEl(slot)); this.toast(v.reason!); return; }
    this.onEquip(index);
  }

  private tryMove(source: { index: number; st: { x: number; y: number } }, x: number, y: number, w: number, h: number, el: HTMLElement): void {
    if (x === source.st.x && y === source.st.y) return; // dropped back where it was
    const others = this.state!.player.inventory.filter((_, i) => i !== source.index);
    if (!rectFree(others, x, y, w, h)) { this.shakeEl(el); return; }
    this.onMoveItem(source.index, x, y);
  }

  /** Unequip `slot` into the bag — onto (x,y) when the drop targeted a cell,
   *  else wherever the sim finds room. Pre-checks so the sim never silently no-ops. */
  private tryUnequip(slot: EquipSlot, x?: number, y?: number): void {
    const st = this.state!.player.equipment[slot];
    if (!st) return;
    const s = itemSize(ITEMS[st.defId]);
    const inv = this.state!.player.inventory;
    const ok = x !== undefined && y !== undefined
      ? rectFree(inv, x, y, s.w, s.h)
      : !!firstFreeCell(inv, s.w, s.h);
    if (!ok) {
      this.shakeEl(this.slotEl(slot)); this.toast(x !== undefined ? 'No room there' : 'Bag full');
      return;
    }
    this.onUnequip(slot, x, y);
  }

  /** Right-click a grid item: use a consumable (travel only, decyzja v3-3) or quick-equip gear.
   *  While carrying, right-click cancels the carry instead. */
  private quickAction(el: HTMLElement, index: number, st: ItemStack): void {
    if (this.drag) { this.endCarry(); return; }
    const def = ITEMS[st.defId];
    if (!def) return;
    if (def.consumable) {
      if (this.state!.combat) { this.shakeEl(el); this.toast("Can't use in combat"); return; }
      this.onUseItem(index);
    } else if (def.slot) {
      this.tryEquip(index, st, el);
    }
  }

  private shakeEl(el: HTMLElement): void {
    el.classList.remove('nudge');
    void el.offsetWidth; // restart the animation
    el.classList.add('nudge');
    el.addEventListener('animationend', () => el.classList.remove('nudge'), { once: true });
  }

  // ---- hover tooltip ----

  private showItemTip(e: PointerEvent, st: ItemStack): void {
    if (!this.drag) this.showTip(e, st);
  }

  private showSlotTip(e: PointerEvent, slot: EquipSlot): void {
    if (this.drag) return;
    const st = this.state?.player.equipment[slot];
    if (!st) { this.hideTooltip(); return; }
    this.showTip(e, st);
  }

  /** Rebuild + measure only on a stack change; repeat pointermoves just reposition. */
  private showTip(e: PointerEvent, st: ItemStack): void {
    if (this.tipStack !== st || this.tipQty !== st.qty) {
      this.tipStack = st;
      this.tipQty = st.qty;
      this.tip.innerHTML = this.tooltipHtml(st);
      this.tip.classList.remove('hidden');
      const r = this.tip.getBoundingClientRect(); // one forced layout per content change
      this.tipW = r.width; this.tipH = r.height;
    }
    this.positionTip(e.clientX, e.clientY);
  }

  private positionTip(px: number, py: number): void {
    const pad = 10;
    let x = px + 16, y = py + 16;
    if (x + this.tipW + pad > window.innerWidth) x = px - this.tipW - 16;
    if (y + this.tipH + pad > window.innerHeight) y = window.innerHeight - this.tipH - pad;
    this.tip.style.left = `${Math.max(pad, x)}px`;
    this.tip.style.top = `${Math.max(pad, y)}px`;
  }

  private hideTooltip(): void {
    this.tip.classList.add('hidden');
    this.tipStack = null;
  }

  /** Tooltip body: name/tier/slot, item + required level (red if too low), weapon dmg/range,
   *  attribute bonuses, consumable effect, quantity, and an action hint. */
  private tooltipHtml(st: ItemStack): string {
    const def = ITEMS[st.defId];
    if (!def) return `<div class="tt-name">${st.defId}</div>`;
    const p = this.state?.player;
    const plus = st.plus && st.plus > 0 ? ` +${st.plus}` : '';
    const kind = def.weaponType ? cap(def.weaponType) : def.slot ? cap(def.slot) : cap(def.kind);
    const rows: string[] = [
      `<div class="tt-name" style="color:var(--tier${def.tier})">${def.name}${plus}</div>`,
      `<div class="tt-sub">Tier ${def.tier} · ${kind}</div>`,
    ];
    if (def.itemLevel) rows.push(`<div class="tt-line">Item level ${def.itemLevel}</div>`);
    if (def.reqLevel) {
      const low = !!p && p.level < def.reqLevel;
      rows.push(`<div class="tt-line${low ? ' tt-bad' : ''}">Requires level ${def.reqLevel}</div>`);
    }
    if (def.weapon) {
      rows.push(`<div class="tt-line tt-buff">+${def.weapon.dmgPerChar} dmg / key</div>`);
      if (def.weapon.range) rows.push(`<div class="tt-line">Range ${def.weapon.range} tiles</div>`);
    }
    if (def.bonuses)
      for (const key of Object.keys(def.bonuses) as AttributeId[]) {
        const v = def.bonuses[key] ?? 0;
        rows.push(`<div class="tt-line tt-buff">${v >= 0 ? '+' : ''}${v} ${ATTR_LABEL[key]}</div>`);
      }
    if (def.consumable?.heal) rows.push(`<div class="tt-line tt-buff">Restores ${def.consumable.heal} HP</div>`);
    if (def.consumable?.mana) rows.push(`<div class="tt-line tt-buff">Restores ${def.consumable.mana} MP</div>`);
    if (st.qty > 1) rows.push(`<div class="tt-sub">Quantity ${st.qty}</div>`);
    const hint = def.consumable ? 'Right-click to use' : def.slot ? 'Drag or double-click to equip' : '';
    if (hint) rows.push(`<div class="tt-hint">${hint}</div>`);
    return rows.join('');
  }

  private toast(text: string): void {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.els.toasts.appendChild(div);
    div.addEventListener('animationend', () => div.remove());
  }
}
