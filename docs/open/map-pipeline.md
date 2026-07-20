# Painted-map pipeline — working file

**Status:** `[I]` implemented 2026-07-20, awaiting the user's `[V]`. All decisions in
`docs/decisions.md` → "Painted maps". This file doubles as the HOW-TO.

## How to paint a map (the loop)

1. `npm run maps:palette` → open `paintings/ink-palette.png` beside MS Paint and
   **eyedropper** colors from it (never type RGB by hand).
2. Paint — one folder per map, `paintings/<id>/` (1 px = 1 tile, flat top-down; the
   game renders it isometric):
   - `terrain.png` — floors/water/mountains/tree walls; black = void (out of map —
     any dungeon shape).
   - `markers.png` (black background): ONE spawn pixel, portal pixels, mob-group
     site pixels, structure footprints (fill a rect), fixed-spot pixels.
   - `regions.png` (optional): safe-zone areas.
   - `config.json`: `{ id (= folder name), name, groups: { "<G>": { respawnSeconds,
     maxAlive } }, spots: { "x,y": { count, radius } } }`.
3. `npm run maps:compile` — the LINTER reports every bad pixel with coordinates and
   the nearest known ink, writes `paintings/<id>/errors.png` (offenders flashed
   magenta) and fails on any error. On success → `src/game/maps-compiled/<id>.json`
   (RLE, hashed). Code-built maps' folders are skipped (rename the folder + config
   id to fork one).
4. The game auto-registers every compiled JSON — no code changes. PNGs are working
   files only; regenerate them any time with `npm run maps:export -- <mapId>`.
5. `preview.html` (dev: `/typingRPG/preview.html`) — the real renderer with no sim:
   pick a map, drag to pan, wheel to zoom; labels on portals/spawn; mobs drawn on
   EVERY possible spawn site.

New content slots in by APPENDING (never reorder): `PORTAL_INKS` / `MOB_INK_ORDER`
(src/mapkit/inks.ts), `GROUPS` (src/game/groups.ts), `STRUCTURES`
(src/mapkit/structures.ts). Then re-run `maps:palette`.

## Implemented `[I]`

- [I] Ink registry with channel-namespaced colors + palette card generator.
- [I] Compiler + linter (unknown colors w/ nearest-ink hints, reachability flood,
      sidecar validation, errors overlay) on pure RGBA buffers (unit-tested).
- [I] Compiled JSON format (RLE grids + manifest hash), lazy-registered by the game.
- [I] Exporter (any MapDef → PNGs + sidecar); meadow export→compile round-trips
      byte-for-byte (test).
- [I] Mob GROUPS: composition registry + runtime spawner (maxAlive, cooldown,
      random FREE site rotation, site frees when the whole instance dies).
- [I] Regions: painted SAFE zone = no proximity aggro (damage still answers).
- [I] Structures: painted footprints stamp bridges / arena rings (reusable registry).
- [I] New terrains: stone floor, mountain (blocked; fly-over reserved), void (black).
- [I] Demo: **The Painted Cellar** (44×58 void-shaped dungeon; portal south of the
      meadow plaza) — 2 rotating groups, a golem spot, a bridged water channel,
      a safe entrance hall. `paintings/cellar/` is the reference example (its
      markers.png shows a hand-painted STRUCTURE footprint — exports flatten those).
- [I] Preview tool (`preview.html`) using the real render modules.
- [I] Paintings exported for ALL current maps (`paintings/<id>/`, ~670 KB total) —
      edit any world in Paint; code-built ids are compile-guarded against
      accidental shadowing (fork by renaming).

## Next (not started)

- [ ] Per-entity passability RUNTIME (swim/fly speeds, flying mobs growing over
      mountains, player mount states) — the terrain data is ready, movement checks
      are still binary.
- [ ] Height layer (`<id>.height.png`, brightness = elevation) once elevation matters.
- [ ] Export the remaining code-built maps to paintings when the user wants to edit
      them (exporter is generic; only meadow is round-trip-TESTED so far).
- [ ] Group wandering within painted regions.
