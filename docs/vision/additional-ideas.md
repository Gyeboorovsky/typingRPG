# Additional ideas — things the vision brief did NOT mention (my own additions)

Explicitly requested: independently flag other things that matter for a large
MMORPG's architecture or player enjoyment that the user has not mentioned.
Everything below is my addition, ordered roughly by how expensive it is to
ignore.

---

## 1. Chat & social plumbing (the biggest unmentioned system)
An MMO without chat isn't an MMO — and in THIS game chat collides with the
core mechanic: in fight mode every printable key is combat input (locked
decision). Proposal: chat entry is a modal state (Enter-to-chat conflicts
with ult — needs a design pass; maybe T/Alt+Enter), impossible to open
mid-fight (which is a fairness feature, `guilds-and-pvp.md` §4). Channels:
say/zone/party/guild/whisper. **The hidden cost is moderation**: profanity
filtering, mute/report tooling, GDPR retention rules for chat logs, and GM
staffing — budget it as a feature, not a checkbox. Also: friend list, ignore
list, offline whisper→mail-lite (or explicitly no mail — auction-house-less
economy already leans on direct contact).

## 2. Sound design (zero audio exists today)
Not one sound in the codebase (`options.ts` Audio section is a stub). For a
typing game, audio is half the game-feel: per-keystroke hit ticks, typo
thunk, streak-milestone risers, ult payoff, boss shield crack. A small
"audio sprite" system (one Web Audio context, pooled buffers) is a
weekend-scale feature with outsized feel returns — worth doing long before
multiplayer. (Client-only; no purity concerns — it consumes the existing
`Fx` stream, which is exactly what `Fx` is for.)

## 3. Internationalization & keyboard-layout reality
- Word pools are English-only (`src/game/words.ts`), UI strings hardcoded.
  The developer and likely first community are Polish — a PL word pool is
  both a market advantage and a PvP fairness question (typing your native
  language is faster): server must constrain locale choice in competitive
  contexts (both arena players type the same pool) — flagged in `configs.md`.
- Keyboard layouts: typing resolves via `e.key` (layout-correct) and
  movement via `e.code` (layout-independent) — already the right split
  (`src/input.ts`). But tier-4 prompts use punctuation (`words.ts` boss
  phrases: `!`, `;`, capitals) that costs different keystrokes on QWERTZ/
  AZERTY; and AltGr (already normalized in `keybinds.ts`
  `normalizeModifiers`) is *required* for some chars on PL layouts — a
  prompt containing them would fight the combat-modifier. Rule of thumb to
  adopt: prompt character sets must be validated per-locale (no chars
  requiring AltGr on that locale's standard layout).

## 4. Onboarding & the typing skill floor
The game's fun gate is WPM. A new-player experience that (a) teaches the
mode system interactively (the practice-fight feature, Group B, is the
natural tutorial arena — nice convergence), and (b) flatters slow typists
early (tier-1 words are already short; early mob HP tuned so 25 WPM feels
heroic) decides retention more than any endgame system. Consider a visible
personal WPM/accuracy stat from day one — self-improvement is this game's
unique retention hook (ties into the stats profile in `monetization.md`).

## 5. Live-ops, deploy & versioning mechanics
- Pages CDN caches ~10 min (CLAUDE.md) — fine for a static toy, dangerous
  for an online client: after a server deploy, stale clients must be told to
  refresh. Protocol version handshake + a "new version, reload" banner is
  mandatory S1 work (`multiplayer-architecture.md` §2.6).
- Server deploys need a maintenance-mode + graceful-save-and-kick path; the
  event-queue architecture makes state flush clean, but the workflow (announce
  → drain → deploy) should exist before the first live weekend.
- Seasonal/live events as server config (XP weekend toggles, spawn swaps) —
  the cheapest content multiplier a solo dev has.

## 6. Observability & GM tooling (day-one, not later)
Server metrics (tick time, CCU, per-zone entity counts), structured logs,
crash reporting (client + server), and an economy dashboard (gold created/
destroyed per day, top traders) — `anti-cheat.md` and `economy.md` both
depend on this existing EARLY; retrofitting telemetry after an exploit is
archaeology. GM commands are just admin-gated `devCheat`-style events — the
cheat architecture accidentally built the GM console's transport already.

## 7. Legal & compliance (EU solo-dev realities)
Accounts ⇒ GDPR: privacy policy, data export/delete flows, explicit
disclosure of keystroke-timing collection (`anti-cheat.md` Layer 1 — this is
behavioral biometric-adjacent data; say so plainly), chat-log retention
policy. Payments ⇒ VAT (Stripe Tax handles MOSS), consumer-rights withdrawal
text for digital goods, and — if minors are plausible users — parental-
consent posture. None of this is hard; all of it is worse discovered late.

## 8. Database backups & rollback drills
Managed-Postgres daily snapshots + point-in-time recovery, AND a practiced
restore procedure. Every MMO eventually has the bad Sunday (dupe exploit,
corrupting bug); the difference between a scar and a shutdown is whether
rollback was rehearsed. Pairs with the immutable trade/item logs
(`economy.md` §4).

## 9. Name policy & identity
Character-name uniqueness scope (global vs per-shard — depends on the
megaserver decision), reserved/offensive-name filtering, rename item
(`monetization.md`), and impersonation rules (GM names protected). Tiny
system, community-defining.

## 10. Performance guardrail: the DOM HUD at MMO scale
`hud.ts` re-renders inventory via innerHTML rebuild on `invRev` bump —
fine solo; with party frames, nameplates, chat, and shop windows the DOM
budget needs watching (nameplates over dozens of players likely belong on
the canvas, not DOM). Not urgent; recorded so the first "HUD janks in town"
report has a suspect list.

## 11. A "vertical slice" discipline suggestion
Before building horizontally (all weapons × all systems), consider one
polished vertical slice per phase — e.g. Phase-combat: sword+bow only, one
new map, sound, indicators — playtested with real humans (even 5 friends).
The plan documents in this folder are wide by design; the build order should
stay narrow and playable at every step. `priority-order.md` is written with
this bias.
