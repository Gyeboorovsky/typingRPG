# Multiplayer architecture — server-authoritative MMO, shards, one universal account

Vision (user, verbatim intent): full MMO on the scale of Metin2. Server-
authoritative simulation (client sends intent, server resolves). Multiple
server shards, but **ONE universal account/character usable across all
shards** — not separate per-shard characters. Start small (tens of concurrent
players) and scale with budget/revenue; don't over-engineer day one, but don't
block scaling later.

---

## 1. Current-state assessment

### What already actively helps (this is real, earned value)

- **The pure sim core is genuinely liftable.** `src/game/sim.ts` is a fixed-
  timestep reducer: `update(state, events, dt)` consumes a plain
  `InputEvent[]` queue, mutates a serializable `GameState`, and emits `Fx[]`
  for presentation. No DOM, no `Date.now`, seeded PRNG lives in state
  (`src/game/rng.ts`, `GameState.rng`). This is exactly the seam CLAUDE.md
  promised, and it has been *kept* honest through every feature so far —
  equipment, cheats, control modes all flow through the same reducer.
- **Determinism is intact.** All randomness flows through `rand(state)`
  (mulberry32 in `rng.ts`); even the godmode guard was deliberately placed
  *after* the rng-consuming dodge roll (`hurtPlayer` in `src/game/combat.ts`)
  to preserve seed-determinism. A deterministic, event-sourced sim enables
  server replay, audit logs, and cheap desync debugging later.
- **Input is already "intent, not outcome."** The client never sends "I dealt
  12 damage" — it sends `{type:'char', ch}` / `{type:'move', dirs}` /
  `{type:'equip', index}` events (`src/game/types.ts` `InputEvent`). That is
  precisely the client→server protocol shape an authoritative server wants.
- **Some code already anticipates a server.** `src/game/items.ts` documents
  its module-level `occ` scratch buffer as safe "even for a future server tick
  handling many players sequentially"; `src/game/attributes.ts` keys its
  attribute cache on a `WeakMap<Player, …>` and notes it "scales to N players
  on one server process"; `src/game/mobs.ts` `separate()` names the spatial-
  hash upgrade for MMO-scale mob counts.
- **Cheats route through the reducer** (`devCheat` event → `applyCheat` in
  `sim.ts`), so the future server-side admin gate is one check at one choke
  point, as `CLAUDE.md` and `docs/cheats.md` already require.

### What actively blocks (the honest gap list)

- **`GameState.player` is singular.** `Player`, `CombatState` (one prompt, one
  streak), `held` (one movement vector), `fireMode`, `travelUnlocked`, `fx`
  (one client's presentation queue) are all single-player fields on the global
  state (`src/game/types.ts`). Every consumer assumes one hero.
- **World data are module-scope singletons.** `src/game/map.ts` builds ONE
  48×48 map's `terrain`/`blocked`/`PROPS`/`SPAWN` at module load;
  `src/game/mobs.ts` hardcodes `SPOTS` as a module const. A server running
  multiple zones (or one zone per process) cannot instantiate these — see
  `maps-and-rendering.md`, which needs the same `MapDef` refactor for its own
  reasons. This is the single biggest shared prerequisite.
- **`InputEvent` carries no actor.** Events are implicitly "the player's."
  Multiplayer needs `{playerId, event, seq}` at minimum.
- **Fx and prompts are global.** `state.fx` is drained by the one renderer;
  `CombatState.prompt` is generated inside the sim from the shared RNG
  (`promptFor` in `combat.ts`/`words.ts`). Per-player prompts each consuming
  the zone RNG would make one player's typing perturb another's loot rolls —
  RNG needs splitting (per-player stream or per-subsystem streams).
- **Persistence is local-only by design.** `src/save/` (Tauri fs / File System
  Access / localStorage) is explicitly a single-player concern (CLAUDE.md says
  so). Server persistence is a new layer, not an extension of this one.
- **No auth, no accounts, no network layer.** Nothing exists; that's correct
  per the "no speculative server code" rule.
- **60 Hz sim tick is a client luxury.** `SIM_DT = 1/60`
  (`src/game/constants.ts`) is fine locally; an authoritative server ticking
  60 Hz per zone burns CPU for no gameplay benefit in a typing game.

---

## 2. The core architecture (proposal)

### 2.1 Authoritative loop

Client keeps running the full sim as a **predictor** (instant local feedback —
critical for typing feel), server runs the same `update()` as the **authority**:

1. Client captures keystrokes/intents exactly as today (`src/input.ts` →
   event queue), stamps each with a client sequence number + client time, and
   sends them over WebSocket instead of (as well as) feeding the local sim.
2. Server buffers per-player events, runs the zone tick (proposed 20–30 Hz —
   typing damage doesn't need 60 Hz server resolution; keystroke *timestamps*
   preserve sub-tick ordering where it matters), and broadcasts deltas.
3. Client reconciles: server state is truth; the local predicted state is
   corrected (position snap/lerp, HP correction, prompt-progress correction).

**Typing-specific latency handling** (per CLAUDE.md's warning and the user's
"looser fairness is fine" stance): the client shows its own prompt progress
optimistically and *never* waits for an ack per keystroke. The server validates
the keystroke stream against ITS copy of the prompt (the prompt text must be
server-generated — the client is never trusted to say "that char was
correct"). Mid-prompt divergence (rare: a mob died server-side before the
client knew) resolves in the server's favor on the next delta. This is far
easier than shooter lag compensation and fits the genre.

### 2.2 Sim refactor (the pre-MMO homework, doable while still single-player)

- `GameState` → `ZoneState`: `players: Map<PlayerId, Player>`, per-player
  `CombatState`/`held`/`fireMode`/`travelUnlocked` move onto (or alongside)
  `Player`; `fx` becomes per-player (or tagged with an audience).
- `InputEvent` wrapped as `{playerId, seq, event}`; `update()` iterates
  per-player queues.
- `map.ts`/`mobs.ts` singletons → instantiable `MapDef`/`ZoneDef` (see
  `maps-and-rendering.md`).
- RNG: one stream per zone for world events (spawns, drops) + one per player
  for personal rolls (prompts, dodge), so players can't perturb each other's
  determinism.
- **Do this refactor with N=1 while the game is still single-player.** The
  test suite (130 pure tests) and the sim's purity make it a mechanical,
  verifiable change now; it becomes a risky rewrite later. This is the
  cheapest insurance the project can buy.

### 2.3 Runtime topology by stage (scaling thresholds)

| Stage | CCU target | Topology | Monthly cost ballpark |
|---|---|---|---|
| **S0** | 0 (today) | Static GitHub Pages, local saves | $0 |
| **S1 — first online alpha** | ~10–50 | ONE Node/Bun process: auth + WebSocket + all zones in-process; Postgres (managed free tier, e.g. Neon/Supabase) or SQLite-on-VM | $5–10 (one small VM, e.g. Hetzner/Fly.io) |
| **S2 — small live game** | ~50–300 | Same single game process, but auth/accounts split into its own service; managed Postgres (paid tier); daily backups; a second VM only if CPU says so | $20–60 |
| **S3 — zones split** | ~300–1500 | One process per zone group ("zone servers"), a gateway/router process, Redis (or NATS) for cross-zone messaging (chat, guilds, trade notifications) | $100–300 |
| **S4 — shards** | 1500+ | Multiple named shards (each = a full S3 cluster), central account/character service shared by all | scales with revenue |
| **S5 — multi-continent** | distant future | Shards pinned to regions; central account service replicated; typing tolerance means cross-region play is *playable*, just not ideal | — |

Rules that keep S1 from blocking S4:
- All persistence behind a repository interface from day one (swap SQLite →
  Postgres → per-shard DB without touching game code).
- Zone code never assumes "same process" for another zone — cross-zone effects
  (teleport, whisper, trade request) go through a message bus interface even
  when the bus is an in-process function call at S1.
- Player sessions addressed by `accountId`, never by socket identity.

### 2.4 One universal account/character across shards

The user explicitly wants Metin2's *scale* but NOT Metin2's per-shard
characters. Two coherent models exist; they have very different economic
consequences and this **must be a conscious decision**:

- **Option A — "megaserver" (one logical world, shards are just capacity):**
  one character store, one economy, one guild list; "shards" are zone-server
  clusters players are routed across transparently (ESO/GW2 style). Cleanest
  match for "one character usable everywhere," and honestly the natural
  reading of the user's requirement. Tradeoffs: the economy is global (one
  botting wave hits everyone — raises the stakes for `anti-cheat.md`); "server
  community" identity (a Metin2 charm) is lost; world-boss/PvP events need
  instancing rules.
- **Option B — named shards + central character store (character roams):**
  character (level/gear/inventory) lives centrally; a player logs into shard X
  today, shard Y tomorrow, same character. Tradeoffs: either the economy is
  also central (then B ≈ A with extra steps) or per-shard (then gear/gold
  crossing shards via the character is an arbitrage/RMT machine — near-fatal
  for economy integrity). Cross-shard item flow is the classic reason games
  DON'T do this.
- **Recommendation: Option A.** If shard identity/community is wanted later,
  add named "home shards" as a social label, not an economic boundary. Flag:
  whichever is chosen constrains `economy.md` (shop visibility, trade scope)
  and `guilds-and-pvp.md` (war matchmaking pools).

### 2.5 Accounts & auth (minimum viable)

- Email+password (argon2) plus optional OAuth (Google) later; session JWT for
  the WebSocket handshake; refresh tokens server-side revocable.
- Account ↔ up to N characters (mirrors `MAX_CHARACTERS = 4` in
  `constants.ts`; a natural premium lever — see `monetization.md`).
- Roles on the account (`player` / `gm` / `admin`) — the gate `anti-cheat.md`
  needs for `devCheat`.

### 2.6 Protocol sketch (shape only, not a spec)

- Client→server: `{seq, tClient, events: InputEvent[]}` batched per client
  frame (typing bursts ~10–15 events/s worst case — tiny).
- Server→client: snapshot on join/teleport; then deltas at tick rate
  {entity upserts/removals in interest range, per-player private state (HP,
  prompt, inventory rev), fx}. Interest management (only nearby entities) can
  be naive radius-based at S1 and spatial-hash at S3 — the same structure
  `mobs.ts` already plans for separation.
- Versioned protocol from message one (`v` field) — see `additional-ideas.md`
  on deploy/caching pitfalls.

---

## 3. ⚠ Decision-log conflicts & standing-assumption changes

1. **Cheats run in ALL builds** (locked in `decisions.md` as a deliberate
   single-player choice). Fine until the first online build; the flip to
   admin-gated + server-validated is already mandated by CLAUDE.md — but note
   it means *the public web client must stop shipping the recognizer as an
   effective tool* (recognizing locally is harmless; the server must reject
   non-admin `devCheat`). No walk-back needed, just the planned gate.
2. **Local save slots are the progression store** (SaveData v2, `src/save/`).
   Online characters must live server-side; local saves cannot "import" into
   the MMO without trivially enabling forged characters. Proposal: online mode
   = fresh server characters; the local single-player mode either (a) remains
   as a separate offline sandbox (cheap — everything already works), or
   (b) is retired at launch. Recommendation: (a) — it's free QA/demo value.
   This should be logged as a decision when multiplayer work starts.
3. **Natural leveling is unbounded** (`MAX_LEVEL = 120` is *cheat-clamp only*
   per `decisions.md`/`constants.ts`). An MMO with PvP and a shared economy
   needs a real level cap. Proposal: make `MAX_LEVEL` the actual cap when the
   server ships (Metin2 uses 120; user already noted "may become 99 later").
4. **`RESPAWN_FULL = true` (no death penalty)** — fine solo; grind-lean MMOs
   typically want an XP-loss or durability sting. Cross-referenced in
   `progression.md`; server-side tunable either way.
5. **Single-global keybind set stored in `localStorage`** — no conflict:
   keybinds are client-device settings and should STAY client-local (see
   `configs.md`). Cloud-syncing them per account would be an additive feature,
   not a walk-back.

---

## 4. What would need to change (summary, no order implied — see priority-order.md)

- `src/game/`: multi-player `ZoneState`, actor-tagged events, per-player
  fx/prompt/RNG, `MapDef`-instanced world (shared prerequisite with maps).
- New (server repo or `server/` workspace): WebSocket gateway, zone runner
  (imports `src/game/` unmodified — this is the whole payoff), auth service,
  persistence repository (Postgres), message-bus interface.
- New (client): network layer (predict + reconcile), connection UI, character
  roster from server instead of `SaveManager.listSlots()`.
- `PLAN.md`: none of its staged prompts conflict with this; the sim refactor
  (§2.2) should be staged there as its own `[PLAN]` pillar before any netcode.
