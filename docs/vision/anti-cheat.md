# Anti-cheat & anti-bot — first-class from the start (typing MMO specifics)

Vision (user): HIGH PRIORITY from the start of the plan, not deferred —
especially given free-form trading and PvP. Propose a concrete approach for a
server-authoritative typing-combat MMO.

---

## 1. Current-state assessment

- **The client is 100% trusted today, by explicit documented choice.** It
  computes its own damage, applies its own cheats (`devCheat` →
  `applyCheat`/`setLevel` in `src/game/sim.ts`, godmode guard in
  `combat.ts` `hurtPlayer`), and writes its own saves. CLAUDE.md,
  `docs/cheats.md`, and decisions.md all carry the same warning: admin-gate +
  server-validate before ANY online exposure. Nothing to fix now; everything
  to gate later.
- **The architecture is unusually anti-cheat-friendly already**, and this is
  worth saying plainly: a deterministic, seeded, event-sourced reducer
  (`update(state, events, dt)`, RNG in state) means the server can (a) be the
  only executor of game logic, and (b) *replay* any player's event log
  bit-for-bit for audits. Most MMOs retrofit this; here it exists on day one.
- Typing-specific attack surface (the honest threat model):
  1. **Auto-typers/bots** — read the prompt from memory/DOM/OCR, type
     perfectly at any WPM. THE existential threat: farming bots devalue the
     economy (free trading makes laundering easy) and perfect typists break
     PvP.
  2. Client tampering — trivial in a browser (view-source is a documented
     assumption in CLAUDE.md's Security section). Irrelevant once the server
     is authoritative: a tampered client can only send *intents*.
  3. Packet forgery/replay — same answer: server validates every event
     against ITS state (prompt text, positions, inventory).
  4. Movement/speed hacks — server recomputes movement from held-dir events
     with server dt; client positions are display-only.
  5. Dupes/economy exploits — trade atomicity + item instancing + logs
     (`economy.md` §4).
  6. Multiboxing/account farms — account friction + economic gates.

## 2. Proposed architecture (layers, cheapest-first)

### Layer 0 — server authority (eliminates whole classes, not just detects)
Everything in `multiplayer-architecture.md` §2: server-generated prompts
(the client NEVER reports "correct char", it reports "I pressed 'k' at t" and
the server matches it against its own prompt state); server-computed damage,
drops, XP, movement, trade, shop transactions. This is the non-negotiable
foundation — with it, "cheating" reduces to "botting + exploiting bugs."

### Layer 1 — keystroke-stream plausibility (the typing game's home turf)
Keystroke dynamics are a mature biometric field, and this game *natively*
collects exactly that data. Server-side, per account, continuously:
- **Rate ceilings:** sustained WPM above a config threshold (e.g. 200 WPM
  over 10 min) flags; burst ceilings catch paste-like input.
- **Variance analysis:** human inter-key intervals are noisy and key-pair
  dependent (th ≠ qz); bots are uniform or wrongly-distributed. Low variance
  + near-zero error rate over long windows = high-confidence bot signal.
- **Error asymmetry:** humans make keyboard-adjacent typos and fatigue over
  sessions; 0.0% error across hours is itself a signal.
- **Fingerprint drift:** a per-account typing profile (digraph timing
  histogram) that suddenly changes (account sharing/sold accounts/bot
  takeover) or that matches another account's profile too well (bot farm
  running one engine) flags for review.
Score-based: signals accumulate into a suspicion score → soft actions first
(see Layer 3). None of this needs client cooperation and none of it can be
"patched out" by a better client hack — the bot must simulate human typing
statistics to pass, which raises bot cost enormously (that's the win
condition: make botting more expensive than playing).

### Layer 2 — economic + behavioral gates (blunt the payoff)
Trade/level gates for fresh accounts (`economy.md` §2); gold/hour and
drops/hour anomaly monitors per zone (a dashboard from day one — see
`additional-ideas.md` §observability); item instancing + full trade/shop
logs (retroactive rollback capability after an exploit — the tool every MMO
eventually needs on a bad Sunday); email verification + rate-limited account
creation + optional CAPTCHA at REGISTRATION only (never in gameplay — a
typing game interrupting play with typing tests would be self-parody).

### Layer 3 — enforcement policy (keep it boring and reversible)
Suspicion score tiers: silent watch → in-game "verify" friction only for
high scores (e.g. a one-time altered-prompt challenge — the server swaps in
a prompt with unusual words; OCR bots pass this, memory-readers pass too, so
treat it as weak evidence, mostly UX deterrence) → temp trade freeze →
manual GM review → ban waves (batched, not instant, so bot authors can't
A/B-test detection) with replay evidence attached (Layer 0's determinism
makes "show me" possible). Appeals path from day one; false-positive
tolerance near zero for typing-speed flags (fast humans exist — 150+ WPM is
rare but real; thresholds must be generous and combined with variance
signals, never WPM alone).

### The cheat-code gate specifically (closing the documented loop)
`devCheat` events: server rejects unless the account role is `gm`/`admin`
(role on the account record — `multiplayer-architecture.md` §2.5), executes
server-side via the same `applyCheat` path, and writes an admin-action audit
log. The client-side recognizer (`src/cheats.ts` / `cheat-listener.ts`) can
even stay shipped — an unauthorized `devCheat` is just an ignored packet +
a suspicion ping. This satisfies the CLAUDE.md requirement with one check at
one choke point, exactly as the two-layer cheat design intended.

## 3. What NOT to invest in (explicit non-goals)
Client-side anti-tamper/obfuscation (futile in a browser, hostile on
desktop, zero value once the server is authoritative); kernel/driver
anticheat (absurd for the genre); real-time ML (the offline/batched
statistical layer above is sufficient at this scale); punishing VPN use
(hurts legitimate players; use it only as a weak corroborating signal).

## 4. ⚠ Decision-log cross-checks
- "Cheats run in ALL builds" (locked, deliberate) — unchanged for
  single-player; the online gate above is the already-mandated companion
  decision, to be logged formally when server work starts.
- Godmode-inside-`hurtPlayer` RNG-ordering (locked) — server-side execution
  preserves it automatically (same code).
- The keystroke-timing telemetry Layer 1 needs is exactly the data the
  premium typing-stats profile (`monetization.md`) would surface — one
  pipeline, two consumers; privacy disclosure required
  (`additional-ideas.md` §legal: keystroke timing is behavioral data — put
  it in the privacy policy explicitly).
