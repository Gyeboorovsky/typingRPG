# Economy — free trading, offline player shops (no auction house), sinks, item identity

Vision (user): free player-to-player trading. **NO auction house.** Player
shops instead: time-limited, owner does NOT need to stand at them, per-player
shop count and shop size configurable **server-side**, expandable via premium
(extra slots/size as a purchasable perk).

---

## 1. Current-state assessment

- **Currency exists, sinks do not.** Single `gold` on `Player`
  (`src/game/types.ts`); `copper_coin` drops auto-convert on pickup
  (`stepDrops` in `sim.ts`) and on v1→v2 save migration. PLAN.md explicitly
  logs "no gold sink (shop/NPC) — out of scope, follow-up" (v3-12). So gold
  currently only accumulates — fine solo, corrosive in an MMO.
- **Items are fungible stacks, not instances.** `ItemStack = {defId, qty,
  plus?}` — no unique item IDs, no provenance, no bind flags. Two +9 swords
  are indistinguishable. Acceptable offline; a real problem for trading,
  dupe detection, and RMT forensics (see §4 and `anti-cheat.md`).
- **The inventory model is trade-ready in spirit:** positioned grid with
  size/stack rules (`items.ts` `firstFreeCell`/`rectFree`/`addToInventory`),
  and every mutation flows through reducer events (`equip`/`moveItem`/
  `dropItem` in `sim.ts`) — a trade is "just" another event pair once a
  server arbitrates it.
- **Ground drops are visible to one player only** (single-player) — in MMO
  they become contested world state (loot rights: personal-loot per killer is
  the modern default and kills a whole class of loot-ninja toxicity; Metin2
  purists may prefer open loot — decide later, personal-loot recommended).
- Upgrade/craft seams reserved on `ItemDef` (`upgradable`, `upgradeMats`,
  `recipe`, `ItemStack.plus`) — the future demand side of the economy
  (`progression.md`).
- **Everything in this file is server-era work.** No meaningful part of
  trading/shops can ship before the authoritative server exists; nothing
  should be built speculatively (CLAUDE.md rule).

## 2. Direct player-to-player trading (design proposal)

Server-arbitrated trade session (never client-to-client): invite → both
sides place items/gold into an escrow window → both confirm → **any
modification resets both confirms** → second confirm executes atomically
server-side (single DB transaction, both inventories re-validated at commit).
Anti-scam details that are cheap now and expensive to retrofit: full item
tooltip (with `plus`, itemLevel) shown from SERVER data in the trade window;
a deliberate 2–3 s lock between last-change and confirmable; immutable trade
log (who, what, when, where) retained for GM forensics. Level or playtime gate
on trading (e.g. level 10+) throttles bot mule networks (`anti-cheat.md`).

## 3. Player shops — the no-auction-house model

The user's spec is close to Metin2's private shops minus the standing-there
requirement. Proposed model:

- A shop is a server-side entity: owner, location, name, up to `shopSlots`
  listings (item + unit price), opened for `shopDurationHours` (e.g. 24–48 h),
  then auto-closes and returns unsold stock + proceeds to the owner's shop
  ledger (claimable at any NPC/banker — avoids "mailbox" scope creep while
  still not requiring presence).
- **Owner offline = shop stays up** (the user's key requirement). The shop is
  pure server state; a vendor "ghost stall" renders at its spot.
- Placement options (tradeoff, pick one):
  - (a) Anywhere in designated market zones of town maps — most Metin2-like
    street-bazaar feel; needs anti-clutter rules (min spacing, zone caps).
  - (b) Fixed rentable stall plots in a market map — cleaner UX and render
    load, natural gold sink (rent), less organic. **Recommendation: (b) at
    first** (fits small-scale alpha; caps world clutter), (a) later if the
    bazaar vibe is missed.
- Discovery WITHOUT an auction house (this is the design crux — no global
  buy-it-now): walking the market is the primary loop (that's the charm being
  chosen); a **search/browse kiosk** that lists which shops carry an item name
  but does NOT allow remote purchase preserves the intent while removing the
  worst tedium. Flag: this kiosk is 80% of an auction house's convenience —
  the user should consciously choose whether it exists, and whether it shows
  prices. Recommendation: item→shop-location index, no prices shown, no
  remote buying; walking + haggling culture stays alive.
- Server-side config knobs from day one (aligns with `configs.md`):
  `maxShopsPerAccount` (note: per ACCOUNT, not per character — else alts
  multiply shops for free), `baseShopSlots`, `shopDurationHours`,
  `listingFeePct`/`saleTaxPct` (sinks!), zone stall counts.
- Premium expansion (per user): +slots (e.g. 6 base → 12) and +concurrent
  shops (1 base → 2) as purchases. Duration extensions are a plausible third
  lever. This is convenience-tier monetization — consistent with
  `monetization.md`'s cosmetic-first stance, and Metin2-precedented.

## 4. Sinks, faucets, and integrity (the unglamorous part that decides success)

- Faucets today: mob gold drops. Faucets later: quest rewards, boss chests.
- Sinks to plan (roughly in order of introduction): NPC consumables/repairs?
  (no durability exists — optional), **upgrade attempts** (+0→+9 gold +
  materials with failure chance — Metin2's master sink; see `progression.md`),
  shop rent + sale tax, teleport fees (small), guild creation/war fees
  (`guilds-and-pvp.md`), cosmetic dyes. Target: sinks ≈ faucets at
  equilibrium, tuned via server config, monitored from day one (economy
  dashboards — `additional-ideas.md`).
- **Item instancing:** give every non-stackable (gear) item a server-side
  unique id + provenance (created-by event, timestamps). Stackables stay
  fungible. This is a persistence-schema decision, invisible to the sim
  (`ItemStack` can carry an optional `iid` only in server contexts), and it is
  much cheaper to do in the first schema than to backfill after the first
  dupe incident.
- Bind rules: Metin2 is famously trade-everything; the user's "free trading"
  leans the same way. Recommend at most: premium/cosmetic items account-bound,
  everything gameplay tradeable. Keeps the economy alive AND keeps RMT
  pressure high — which is why `anti-cheat.md` treats gold-farming as a
  first-class threat, not an afterthought.

## 5. ⚠ Decision-log / assumption cross-checks

- No locked decision touches the economy yet. The shard-model choice in
  `multiplayer-architecture.md` §2.4 is the biggest upstream dependency:
  megaserver ⇒ ONE economy (shops visible to everyone; bot waves hit
  globally); per-shard economies with roaming characters would be an
  arbitrage hole — this memo assumes the megaserver/global-economy answer.
- `GOLD_PER_COIN = 1` and drop tables in `mobs.ts` become server-tuned values
  — no conflict, just a note that `constants.ts` splits into client-visual vs
  server-authoritative constants when the server lands.
- Consumables-only-in-travel (locked v3-3) interacts with shops selling
  potions — no conflict, but shop UX should surface it ("can't drink in
  fight") to avoid "scam" perception.
