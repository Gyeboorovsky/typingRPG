# Monetization — cosmetic-first, time-limited power-adjacent, plus original ideas

Vision (user): primarily cosmetic. Room for TIME-LIMITED power-adjacent items
(explicit example: an XP-boost ring, Metin2-style) — never permanent
pay-to-win. Additional ideas explicitly requested beyond the user's own.

---

## 1. Current-state assessment

Nothing monetizable exists (correct — no accounts, no server). Relevant
cosmetic surfaces already in code: per-class hero looks are a clean palette
swap (`PAL.classLooks` in `src/render/palette.ts` — skins are literally new
entries); world/UI color systems are centralized (palette.ts / style.css
tokens) so themes are cheap; `ItemStack.plus` badge and tier borders in the
inventory UI show item flair is already a rendered concept; `MAX_CHARACTERS
= 4` (constants.ts) and the inventory's `INV_PAGES = 3` are natural
convenience levers. Premium shop expansion is already specced from the
economy side (`economy.md` §3).

## 2. Framework (the rules before the SKUs)

- Hard line (user): no permanent stat/power purchases. Time-limited
  power-adjacent OK (XP ring). Propose one more line worth committing to
  publicly: **no loot boxes / no paid randomness** — regulatory drift in the
  EU (and the user's likely EU audience) plus community goodwill make this
  cheap to promise now and painful to retrofit later.
- Two currencies max: gold (earned) and a premium currency (bought) — with a
  player-driven exchange (Metin2's later model / WoW token style) considered
  ONLY after the economy is stable; it launders RMT demand into the sanctioned
  economy but adds real complexity. Defer, revisit post-launch.
- Everything premium must be visible in the item tooltip/shop as exactly what
  it is (duration, effect) — trust is the product for a small indie MMO.

## 3. SKU catalog (user's items + original proposals)

**Cosmetics (primary revenue, per user):**
- Hero skins (classLooks variants), weapon skins + typing-trail effects (your
  streak ring / damage numbers get styles — uniquely visible in THIS game
  because combat is typing: prompt-completion fireworks, per-word slash
  effects), mount/pet skins (`progression.md`), shop-stall themes
  (`economy.md`), guild emblem palettes + war banners (`guilds-and-pvp.md`),
  titles/nameplate styles, emotes.
- **Prompt themes (original, genre-native):** fonts/colors/particles for YOUR
  prompt box (client-side, zero balance impact) — the single most-stared-at
  pixel real estate in the game. Includes "typewriter", "runic", "neon" packs.
- Dyes as craftable-with-premium-catalyst (bridges cosmetics into the
  crafting economy instead of bypassing it).

**Time-limited power-adjacent (user's lane, kept narrow):**
- XP-boost ring (e.g. +50% for 7 days — the user's example, Metin2 precedent).
- Drop-rate charm, material-yield charm — same shape, same time-box.
- Guardrail proposal: boosts cap at +50%, never stack with each other, and
  their effect is server-config so events can grant the SAME boost free
  (community goodwill lever — "boost weekends" devalue nothing because the
  paid item is time, not exclusivity).

**Convenience (recommended, clearly not power):**
- Extra character slots (4 → 6/8), extra bag pages (INV_PAGES 3 → 4/5 —
  ⚠ borderline: inventory size is soft power in a farming game; Metin2 sells
  it anyway; flag for a conscious call), shop slots/count (`economy.md`),
  wardrobe/cosmetic storage, name change, appearance re-roll.

**Original structural ideas (my additions):**
- **Season pass, cosmetic-only track** (no XP acceleration in the pass —
  keeps it from becoming homework): seasonal prompt themes, skins, titles;
  free track exists so events are for everyone.
- **Supporter subscription (small, honest):** monthly cosmetic drop + all
  convenience unlocks while active + a supporter nameplate dot. No stats, no
  exclusives that expire forever (FOMO-light: rotate back into the shop).
- **Typing-stats premium profile (original, cheap, sticky):** lifetime WPM
  curves, accuracy heatmaps per finger/key, personal records dashboard — the
  data already exists server-side for anti-cheat purposes (`anti-cheat.md`
  keystroke analysis); selling the *mirror* of it is pure upside and deeply
  on-brand. Free tier shows basics; premium shows history/exports.
- **Cosmetic gifting** (drives social purchases; needs trade-log integration
  for fraud handling first).
- First-purchase double-value pack and a one-time "founder" cosmetic at
  launch (identity, not power).

## 4. Sequencing & ops notes

Monetization needs: accounts (multiplayer S1), a payment provider (Stripe —
handles EU VAT via Stripe Tax; as a PL-based sole developer the paperwork is
real but standard — see `additional-ideas.md` §legal), entitlement storage
(account-level flags/inventory), and a delivery UI. Earliest sensible moment:
AFTER the first stable online phase with retention worth monetizing — pre-
revenue, cosmetics cost art time the project doesn't have; the first three
SKUs should be the cheapest high-visibility ones (prompt themes, hero
recolors, XP ring).

## 5. ⚠ Decision-log cross-checks

- No locked decision touches monetization. Adjacent guardrails: cheats must
  be admin-gated before ANY online play (a premium item that "grants levels"
  would be a de-facto cheat path — never sell progression state directly;
  the XP ring accelerates, it doesn't set).
- Bag pages / character slots as SKUs touch `constants.ts` values that are
  currently hardcoded client-side — they become server-issued entitlements;
  another instance of the client/server constants split noted in
  `economy.md` §5.
