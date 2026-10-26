# CLAUDE.md

2D top-down action RPG inspired by Path of Exile 2's **endgame**. There is no
campaign: the game *is* the endgame loop of running maps, finding loot,
crafting, and pushing harder content.

Stack: **Phaser 3 + TypeScript + Vite**. Single-player first, co-op later.

## Commands

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm run typecheck  # app + sim-only tsc + import boundary check
npm run build      # typecheck, then production build to dist/
npm test           # headless sim tests (vitest)
```

Commit after each working step. Run `npm run typecheck` before committing.

---

## Core design

### The loop

1. Pick a node on the map graph (the **Reach**, see below).
2. Optionally modify a **Cairnstone** (map item) with currency.
3. Run the zone: 2–4 minutes, kill things, trigger mechanics, reach the end.
4. Collect loot, craft, spend passive points, push to harder nodes.

### Zones

- Short, randomly generated, **fairly linear**: a winding main path with
  small dead-end side branches (often with a small reward), ending at a
  **boss arena or an exit**.
- Target clear time: **2–4 minutes**. Generation should be tuned for that,
  not for exploration.
- Generated from a seed by the sim. Same seed + same Cairnstone mods = same
  layout. Tilesets/biomes are data-driven.
- Implementation (`src/sim/zone/generate.ts`): main path is a chain of
  capsule segments whose heading drifts within ±`maxHeadingDegrees` of a
  random overall direction (so it winds but never doubles back); non-adjacent
  corridors keep a `gap` of solid tiles. Branches leave interior nodes at
  65–110° and end in a small clearing (`branchEnds`, future reward spots).
  The layout is rasterized to a tile grid, smoothed, and flood-filled from
  the start so every floor tile is reachable. Packs are placed every
  `spacing` tiles along the path, at most branch ends, plus a big end-arena
  pack. Tune it all in `src/data/zone-gen.json`.
- Zone generation outputs an abstract layout (graph of path segments, branch
  stubs, spawn points, mechanic slots, boss/exit room) that the client turns
  into tiles. The sim never deals with tiles-as-sprites.

### Map mechanics (league-style encounters)

A zone can roll zero or more mechanics into its mechanic slots. Each is a
self-contained sim module defined by data (spawn rules, rewards, scaling).
Working names, ours rather than PoE's:

| Name | Concept |
|------|---------|
| **Rift** | Touch a node; a circle expands over time, spawning waves of monsters from inside it. It collapses when the timer ends; kills feed a reward drop at the end. |
| **Mirror** | A shard you walk into, entering a mirrored copy of the zone with harder, altered monsters and its own reward pool. Exit or time out to return. |
| **Shrine of Tithes** | Altars that spawn a fight; rewards are bought with a tribute currency earned in that fight, with rerolls/deferrals. |
| **Excavation** | Place charges along a route; detonating reveals buried chests and remnant monsters. Choose risk/reward modifiers before detonating. |
| **Reliquary** | Locked strongbox that spawns guardians when opened; rolls its own mods and loot theme. |
| **Essence Prisons** | Monsters trapped in crystals; freeing and killing them yields a guaranteed crafting essence. |
| **Abyss Crack** | A crack that runs across the zone spawning monsters as you follow it, ending in a pit/boss with extra loot. |

New mechanics should slot in without touching the core loop: register a
mechanic id, its data file, and its sim module.

### Cairnstones (map items)

Our equivalent of waystones. A Cairnstone is an item that **opens a zone**.

- Has a tier (difficulty / monster level) and rarity like gear.
- Crafting currency can be used on it to add **map mods** (prefix/suffix
  style): harder monsters, extra packs, extra rarity/quantity, guaranteed
  mechanics, boss changes, etc. More danger = more reward.
- Consumed when the zone is opened. Zones drop new Cairnstones.

### The Reach (endgame map graph)

A **large** procedurally laid out node graph (the atlas equivalent). Nodes
are zones with a biome, tier, and possibly a fixed mechanic or a pinnacle
boss. Completing a node reveals/unlocks neighbours. Plus a separate
**Reach passive tree** that biases map content (more of a mechanic, more of a
currency, juicier bosses).

### Character passive tree

A **large** passive skill tree (hundreds to 1000+ nodes): small nodes, notable
nodes, keystones, class start positions, clusters/wheels. Defined entirely as
data (node id, position, stats, connections). The renderer just draws it.

### Loot

The loot system is the heart of the game and should be big:

- **Item bases**: slot, tags, drop level, implicit mods, base stats.
- **Affixes**: separate **prefix** and **suffix** pools; each affix has a
  `group` (one per group per item), stats, tag filters, and **tiers** gated
  by **item level** with weights.
- **Rarities**: normal (0 mods), magic (up to 1 prefix + 1 suffix), rare (up to
  3 + 3), unique (fixed hand-authored mods, data-defined).
- **Item level** = zone monster level. It gates which tiers can roll.
- **Weighted drop tables**: nestable tables (`kind: "table"`), per-monster and
  per-mechanic tables, global rarity/quantity modifiers applied by the sim.
- A **loot filter** later, operating on sim item data, client-side only.

### Crafting currency

Orb-style consumables that modify items. Our names (working, tweak freely):

| Name | Effect |
|------|--------|
| Whetstone Shard | Normal → magic |
| Tinker's Spark | Reroll a magic item's mods |
| Gilded Seal | Add a mod to a magic item |
| Crown Ember | Magic → rare (adds one mod) |
| Binding Coin | Normal → rare |
| Riftglass | Add a mod to a rare item |
| Unmaking Salt | Remove a random mod |
| Chaos Thread | Remove one random mod, add one random mod |
| Lodestone | Reroll numeric values within current tiers |
| Void Pearl | Corrupt: unpredictable outcome, item can no longer be changed |
| Essences | Add a guaranteed specific mod (from Essence Prisons) |

Every currency's behaviour is a named **effect** implemented once in the sim
and referenced by id from `src/data/currencies.json`. The same effects work on
Cairnstones where it makes sense.

### Multiplayer (later)

Co-op, host-authoritative. The host runs the sim; clients send inputs and
render state. Everything below exists to make that possible without a
rewrite.

---

## Architecture rules

### 1. Simulation is separate from rendering and input

```
src/
  sim/      pure game logic: combat, stats, loot rolls, crafting, map gen,
            mechanics, AI. No Phaser, no DOM, no window, no timers.
  data/     content files (JSON) + typed loader. Same rules as sim.
  client/   Phaser scenes, rendering, input, audio, UI. Reads sim state,
            sends commands/inputs into the sim.
```

- `src/sim` and `src/data` **must not import** from `phaser`, `src/client`,
  or use DOM/browser globals. This is enforced by `npm run typecheck`:
  `tsconfig.sim.json` compiles them with no DOM lib, and
  `scripts/check-boundaries.mjs` rejects forbidden imports.
- The sim advances in **fixed ticks** (`step(state, inputs, dt)` style), driven
  by the client's loop now and a host loop later.
- Player intent enters the sim as **input/command objects** (move direction,
  use skill X at point Y, apply currency C to item I), never as key events.
- **All randomness goes through `Rng`** (`src/sim/core/rng.ts`) seeded from
  the run/zone seed. Never `Math.random()` in sim code.
- Sim state should be plain serializable data (no class instances with
  hidden references), so it can be snapshotted and sent over the network.
- Client may keep visual-only state (tweens, particles, camera shake).

### 2. Content is data, not code

Items, affixes, currencies, monsters, drop tables (and later: uniques, passive
tree, Reach nodes, mechanics, map mods, biomes) live in `src/data/*.json`.

- Schemas are TypeScript types in `src/sim/data/types.ts`. Add/extend types
  there when adding a new content kind.
- `src/data/index.ts` loads and exports typed content.
- Code references content by **string id**, never by hardcoded stats.
- Prefer adding a data entry over adding a code branch. If a new behaviour
  is needed, implement it as a reusable effect/module and reference it by id.
- When content files grow large, split per category (e.g.
  `affixes/weapon.json`) and add validation (unique ids, refs resolve, tiers
  ordered) as a script run by `typecheck`.

### 3. Placeholder art: PixelGen

`tools/pixel-forge.html` is a seeded procedural sprite generator exposing
`window.PixelGen`. Use it for placeholder sprites until real assets exist.

- API: `PixelGen.generate({ type, seed, size, theme })` → pixel grid;
  `PixelGen.toCanvas(grid, scale)`. Types: monster, hero, weapon, potion,
  currency, ring, floor, wall. Themes: random, fire, ice, poison, shadow,
  gold, earth, blood, arcane. Same params → same sprite.
- The game uses it directly: `src/client/art/sprites.ts` imports the HTML via
  Vite `?raw` and runs its `<script id="core">` block. Keep that block
  dependency-free and keep the `id="core"` tag, or sprite loading breaks.
- Content carries sprite params as `SpriteSpec` (`{ type, seed, theme?, size? }`),
  e.g. `"sprite": { "type": "monster", "seed": "husk-1", "theme": "earth" }`.
- To pick seeds, open `tools/pixel-forge.html` in a browser and browse.
- Generated sprites are a client concern only; the sim never knows about
  textures.
- When real art arrives, swap it in by id without touching the sim.

---

## Repo layout

```
index.html                Vite entry; mounts #game
vite.config.ts
tsconfig.json             app config (DOM + Phaser)
tsconfig.sim.json         sim/data-only config (no DOM) — enforces rule 1
scripts/
  check-boundaries.mjs    forbids rendering imports in sim/data
src/
  client/
    main.ts               Phaser.Game config
    art/sprites.ts        loads PixelGen from tools/pixel-forge.html, makes textures
    scenes/BootScene.ts   builds placeholder textures + biome tilesets
    scenes/GameScene.ts   fixed-step loop, input -> sim, sim state -> tilemap/sprites/HUD/minimap
  sim/
    core/rng.ts           seeded RNG (serializable state) with weighted pick
    core/vec.ts           plain-object 2D vector helpers
    data/types.ts         content schemas
    world.ts              zone sim: createWorld(seed) / step() -> SimEvent[]
    world.test.ts         headless sim tests
    zone/generate.ts      linear zone generator (path, branches, arenas, packs)
    zone/zone.ts          Zone data, tile queries, circle-vs-wall collision
    zone/flowfield.ts     BFS distance field; monsters path along it
  data/
    characters.json       player characters (stats, melee attack, sprite)
    monsters.json         monsters (stats, contact damage, sprite)
    zone-gen.json         zone generator tuning (lengths, widths, packs, pools)
    biomes.json           tileset looks per biome (PixelGen floor/wall specs)
    *.json                items/affixes/currencies/drop tables (empty)
    index.ts              typed content loader
tools/
  pixel-forge.html        PixelGen placeholder sprite generator
```

## Conventions

- TypeScript strict mode, `noUncheckedIndexedAccess` on.
- IDs: `snake_case` strings (`life_flat`, `iron_helmet`, `rift`).
- Keep sim functions pure where practical; easy to unit-test headless.
- Sim → client communication is via the returned `SimEvent[]` (swing, damage,
  death, …) plus reading state. The client never mutates sim state.

## Status

**Phase 1 (done):** WASD movement, hold left click to melee toward the mouse,
chasing monster (`husk`) with contact damage, health bars, death + restart.

**Phase 2 (done):** generated linear zones replace the test room. Walls with
collision, monsters asleep in packs until you're within `aggroRange` tiles of
walking distance (the whole pack wakes), flow-field pathing, PixelGen
tilesets per biome, minimap, exit portal in the end arena → "zone cleared" →
next zone. Death retries the same zone seed.
Measured: ~40 s pure walking with 18–24 segments; a bot run that kills its
way through takes ~1:30 with 24–30 segments, so players should land at ~2–3 min.

Dev helpers: `?seed=123` in the URL pins the first zone; in dev builds
`window.__game.world` exposes sim state for debugging/automated play.
