// DOM HUD overlay: bars, typing prompt, boss bar, toasts, inventory, death
// screen. Reads state each frame but only touches the DOM when values change.
import { classOf, maxHp, maxMp } from '../game/classes';
import { aggroed, radiusFor } from '../game/combat';
import { XP_CURVE } from '../game/constants';
import { ITEMS } from '../game/items';
import { MOBS } from '../game/mobs';
import type { Fx, GameState } from '../game/types';

const $ = (id: string): HTMLElement => document.getElementById(id)!;

const INV_SLOTS = 30;

export class Hud {
  private els = {
    hpFill: $('hp-fill'), hpText: $('hp-text'),
    mpFill: $('mp-fill'), mpText: $('mp-text'),
    xpFill: $('xp-fill'), xpText: $('xp-text'),
    promptBox: $('prompt-box'), prompt: $('prompt'),
    pDone: $('p-done'), pCur: $('p-cur'), pRest: $('p-rest'),
    streak: $('streak'), radius: $('radius'), ultHint: $('ult-hint'),
    bossbar: $('bossbar'), bossName: $('boss-name'), bossFill: $('boss-fill'), bossBanner: $('boss-banner'),
    toasts: $('toasts'), inventory: $('inventory'), invGrid: $('inv-grid'),
    death: $('death'), saveDot: $('save-dot'),
  };
  private invOpen = false;
  private lastInvRev = -1;
  private lastFlash = 0;
  private cache: Record<string, string | number | boolean> = {};

  /** Set textContent/width only when the value changed since last frame. */
  private set(key: string, value: string | number | boolean, apply: () => void): void {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    apply();
  }

  sync(state: GameState, fx: Fx[]): void {
    const p = state.player;
    const e = this.els;
    const mhp = maxHp(p), mmp = maxMp(p), need = XP_CURVE(p.level);

    this.set('hp', Math.ceil(p.hp), () => {
      e.hpFill.style.width = `${(p.hp / mhp) * 100}%`;
      e.hpText.textContent = `${Math.ceil(p.hp)} / ${mhp}`;
    });
    this.set('mp', Math.floor(p.mp), () => {
      e.mpFill.style.width = `${(p.mp / mmp) * 100}%`;
      e.mpText.textContent = `${Math.floor(p.mp)} / ${mmp}`;
    });
    this.set('xp', `${p.level}:${p.xp}`, () => {
      e.xpFill.style.width = `${(p.xp / need) * 100}%`;
      e.xpText.textContent = `Lv ${p.level}`;
    });

    const c = state.combat;
    this.set('combat', !!c, () => e.promptBox.classList.toggle('hidden', !c));
    if (c) {
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
      const ready = c.streak >= ult.streakThreshold;
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

    // boss bar while a boss is engaged
    const boss = aggroed(state).find((m) => MOBS[m.defId].boss);
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

    if (this.invOpen && p.invRev !== this.lastInvRev) this.rebuildInventory(state);

    for (const f of fx) {
      if (f.kind === 'pickup') this.toast(f.text);
      else if (f.kind === 'levelup') this.toast(`⭐ Level ${f.level}!`);
    }
  }

  toggleInventory(state: GameState): void {
    this.invOpen = !this.invOpen;
    this.els.inventory.classList.toggle('hidden', !this.invOpen);
    if (this.invOpen) this.rebuildInventory(state);
  }

  closeInventory(): void {
    this.invOpen = false;
    this.els.inventory.classList.add('hidden');
  }

  setSaveStatus(clean: boolean): void {
    this.els.saveDot.classList.toggle('dirty', !clean);
    this.els.saveDot.title = clean ? 'saved' : 'saving…';
  }

  private rebuildInventory(state: GameState): void {
    this.lastInvRev = state.player.invRev;
    const grid = this.els.invGrid;
    grid.innerHTML = '';
    const inv = state.player.inventory;
    for (let i = 0; i < INV_SLOTS; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      const st = inv[i];
      if (st) {
        const def = ITEMS[st.defId];
        slot.classList.add(`t${def.tier}`);
        slot.title = def.name + (def.weapon ? ` (+${def.weapon.dmgPerChar} dmg/key)` : '');
        slot.innerHTML = `<span class="icon">${def.icon}</span><span>${def.name.split(' ')[0]}</span>` +
          (st.qty > 1 ? `<span class="qty">${st.qty}</span>` : '');
      }
      grid.appendChild(slot);
    }
  }

  private toast(text: string): void {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.els.toasts.appendChild(div);
    div.addEventListener('animationend', () => div.remove());
  }
}
