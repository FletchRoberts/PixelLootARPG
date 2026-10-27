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

**After every update:** keep `PLAYING.md` (how to run and play the current
build: setup, controls for keyboard and PS5 controller, what to do, what's
new) accurate, and end your reply to the user with a short "How to play this
version" section based on it. The user plays on Windows (Command Prompt) with
Chrome/Edge and a PS5 controller over USB.

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
- **Layouts** (`zone-gen.json` `layouts`, one weighted pick per seed, each
  overriding generator settings): *Winding Path* (narrow corridor, ~240
  tiles), *Wide Expanse* (6–8 very wide segments, ~17 tiles across, rock
  pillars, packs spread across the width), *Broken Halls* (corridor with
  1–2-node halls that widen to 9–13 tiles). Overlap checks between path
  segments are by path distance, so wide corridors work. Packs and branch
  ends are snapped to floor after pillars are placed.
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
Implemented: `src/data/passive-tree.json` is **generated** by
`node scripts/gen-passive-tree.mjs` (edit the sector themes there, rerun):
start → inner ring → 6 sectors (Int, Dex, Str + 3 hybrids), each with two
wheels (rings of small nodes around notables), a side notable and a keystone,
plus bridges between neighbouring sectors (214 nodes now; add sectors/wheels
to grow it). 1 point per level after the first. `src/sim/passives/tree.ts`:
allocate (must touch your tree), refund (only if the rest stays connected;
free below level 10, then 1 Lethe Ash). Node stats join gear modifiers;
keystones can `grants` supports like uniques (Twin Cast → Echo on spells).

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
  With it: **stacked ground labels** — when several items drop together their
  names stack in a readable list (no overlap), and you can navigate that list
  (D-pad / mouse) to choose exactly which item to pick up.

### Combat math

PoE 2-style, documented in **`docs/combat.md`** (the reference for all
stat/damage work): stat ids + flat/increased/more modifiers aggregated by one
`computeStats()`, hit pipeline base → added → increased → more → roll → crit,
then defender evasion (entropy) → armour `A / (A + 10 × hit)` → resistances
(75% cap) → other reductions → life. Monsters use the same pipeline. All
constants live in data.

### Skills and supports

PoE-style skill gems with support gems, built for Noita/Vampire Survivors-
style chain reactions. Documented in **`docs/skills.md`**. Key rules:
a skill is a tree of **deliveries** (projectile, melee, area, chain, zone,
orbit, summon) with **triggers** (on hit/kill/expire/crit) that spawn child
deliveries; supports and gear change skills only through tag-scoped stat
modifiers or generic structure changes, never skill-specific code; chain
reactions are bounded by depth (3), proc coefficient, damage effectiveness
and an entity budget. Every weapon grants a **weapon attack** (R2 / left
click, no auto-attacking; aim assist on pad) that takes supports. Characters have **levels** and **Str/Dex/Int** (requirements +
small bonuses). Legendaries change skill structure. The full menu of
skills, supports, weapon attacks, legendaries, evolutions and the engine
build waves is in **`docs/skill-catalog.md`**.

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
| Cutter's Prism | +1 level to a skill gem |
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

### 3. Input goes through InputManager

`src/client/input/InputManager.ts` is the only thing that reads keys, mouse or
gamepad. Scenes ask it for `gameplay()` (the sim's `PlayerInput`) and
`pressed(action)` for UI actions, and use `prompt(action)` for button hints so
they show `E` or `✕` depending on the last-used device.

- Keyboard + mouse and controller (browser "standard" mapping: DualSense,
  Xbox, etc. in Chrome/Edge) are first-class. Every new UI screen must be
  fully usable with a pad: navigate with `up/down/left/right` (D-pad or left
  stick, auto-repeat), `confirm`/`cancel`, `tabPrev`/`tabNext`.
- Pad gameplay: left stick move, right stick aim, R2 weapon attack, skills on
  R1/□/△/L1, ○ dodge roll, ✕ pickup. There is no auto attack. With the
  right stick idle, aim assist soft-locks the nearest living enemy in line of
  sight (asleep or awake), preferring ones ahead
  (`src/client/input/aim.ts`). Menus pause the game; inside menus ○ = back,
  ✕ = confirm, L1/R1 = tabs, D-pad = navigate.
- Add new actions to `BINDINGS` in `InputManager.ts`; don't read raw input in
  scenes.

| Action | Keyboard | PlayStation pad |
|--------|----------|-----------------|
| move | WASD / arrows | left stick |
| aim | mouse | right stick (else aim assist) |
| weapon attack | hold left click | hold R2 |
| skill slots 1–4 | right click, Q, E, R | R1, □, △, L1 |
| dodge roll | Space | ○ |
| pickup / use station or portal | F | ✕ |
| open portal to hideout (maps) | T | D-pad ↑ |
| menu (Character/Passives/Gear/Gems/Stones/Currency/Debug tabs) | C | Options |
| passive tree tab shortcut | P | (Options → R1) |
| passive tree: allocate / refund / zoom | Enter / X / Z | ✕ / □ / △ |
| salvage (Gear tab) | X | □ |
| gear tab shortcut | I | touchpad click |
| confirm (menus/overlays) | Enter / Space / click | ✕ |
| cancel / back (menus) | Esc | ○ |
| tab prev / next (menus) | Q / Tab | L1 / R1 |

### 4. Placeholder art: PixelGen

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
PLAYING.md                how to run and play the current build (keep updated)
index.html                Vite entry; mounts #game
vite.config.ts
tsconfig.json             app config (DOM + Phaser)
tsconfig.sim.json         sim/data-only config (no DOM) — enforces rule 1
scripts/
  check-boundaries.mjs    forbids rendering imports in sim/data
  gen-passive-tree.mjs    builds src/data/passive-tree.json from sector themes
src/
  client/
    main.ts               Phaser.Game config
    art/sprites.ts        loads PixelGen from tools/pixel-forge.html, makes textures
    input/InputManager.ts keyboard/mouse + gamepad -> PlayerInput and UI actions
    input/gamepad.ts      standard-mapping buttons, deadzones (pure, tested)
    input/aim.ts          controller aim assist (pure, tested)
    ui/GameMenu.ts        pause menu: Character, Passives, Gear, Gems (sockets), Stones, Currency, Debug tabs
    ui/PassiveTree.ts     passive tree view (hand-clipped drawing, D-pad node hopping, stat preview)
    ui/MapDevice.ts       hideout station: pick a Cairnstone or the free map, salvage stones
    ui/Stash.ts           hideout station: bag ⇄ stash per tab (gear, gems, stones)
    ui/items.ts           item names, rarity colours, icon keys, gear tooltips
    save/storage.ts       character save in localStorage (guarded)
    scenes/BootScene.ts   builds placeholder textures + biome tilesets
    scenes/GameScene.ts   fixed-step loop, input -> sim, sim state -> tilemap/sprites/HUD/minimap
  sim/
    core/rng.ts           seeded RNG (serializable state) with weighted pick
    core/vec.ts           plain-object 2D vector helpers
    data/types.ts         content schemas
    world.ts              zone sim: createWorld(seed, progress) / step() -> SimEvent[]
    stats/stats.ts        stat ids, flat/increased/more modifiers, computeStats()
    stats/character.ts    player stats from base + levels + attributes; XP, levels, monster scaling
    combat/damage.ts      hit pipeline: rollHit / applyHit / expectedHit (docs/combat.md)
    skills/types.ts       DeliveryDef / SkillDef / SupportDef / Loadout / CompiledSkill
    skills/compile.ts     skill + supports + player mods -> CompiledSkill (flat node tree)
    skills/runtime.ts     melee strikes, area bursts, projectiles (pierce→fork→chain→end), triggers, budget
    skills/describe.ts    human-readable skill breakdown for UI
    items/types.ts        GemItem, GroundItem, CharacterSave, SocketTarget
    items/save.ts         newCharacter, loadoutOf (save -> compiler loadout), death penalty
    items/gems.ts         gem levels (by feeding copies), socket counts
    items/drops.ts        weighted nestable drop tables
    items/inventory.ts    equip / unequip gear and gems, socket / unsocket rules
    items/gear.ts         roll gear (base/rarity/affix tiers), gear -> modifiers & grants, tooltip text
    items/compare.ts      before/after stat diff for equip previews
    items/crafting.ts     currency stash + fragment combining, currency effects (gear + stones), salvage
    items/cairnstone.ts   Cairnstones: rolling, names/text, map stats, free maps, MapRun
    world.test.ts         headless sim tests
    zone/generate.ts      linear zone generator (path, branches, arenas, packs)
    zone/zone.ts          Zone data, tile queries, circle-vs-wall collision
    zone/flowfield.ts     BFS distance field; monsters path along it
    zone/hideout.ts       the hideout room (Zone with stations, no packs) and its MapRun
    monsters/attacks.ts   monster attacks: projectiles, telegraphed slams/novas, summons; hits on the player
    monsters/rarity.ts    pack rarity (magic / rare / Legendary), monster mods, applyRarity
    passives/tree.ts      passive points, allocate / refund (connectivity), passive modifiers + grants
  data/
    characters.json       player characters (base stats, attributes, starting weapon, sprite)
    weapons.json          weapon bases and the attack each grants (a DeliveryDef)
    skills.json           active skill gems
    supports.json         support gems (tag-scoped mods and/or trigger additions)
    monsters.json         monsters + bosses (life, damage, defences, attacks, keepDistance, packSize, boss, enrage, sprite)
    monster-mods.json     monster mods (summed stats, granted attacks, on-death attacks)
    monster-rarity.json   pack rarity weights and per-rarity life/damage/XP/loot multipliers
    bosses.json           Titan chance, boss escort, boss rarity weights and multipliers
    progression.json      XP curve, per-level gains, XP penalty
    attributes.json       per-point Str/Dex/Int bonuses
    monster-scaling.json  per-level monster growth rates
    combat.json           armour/evasion/resistance/crit constants
    zone-gen.json         zone generator tuning (lengths, widths, packs, pools) + layouts (map shapes)
    biomes.json           tileset looks per biome (PixelGen floor/wall specs)
    drop-tables.json      weighted drop tables (gems, gear, currency, Cairnstones)
    gems.json             gem levels, sockets by level, bag size, pickup range
    item-bases.json       gear bases (slot, tags, drop level, requirements, implicits, weapon link)
    affixes.json          prefixes/suffixes with tiers by item level
    uniques.json          unique items (fixed mods, support grants, flavour)
    gear.json             rarity weights, affix counts, rare name words
    currencies.json       crafting currency + fragments (effect id, drop weight/level, combine)
    crafting.json         salvage yields per rarity / gem kind / stone, Void Pearl outcomes
    cairnstones.json      stone bag size, rarity weights, level-up chance, free map rules, maxDeaths
    map-mods.json         map mods (affix format, tiers gated by stone level; danger + reward stats)
    hideout.json          hideout room size, station positions, interact range, stash sizes
    passive-tree.json     GENERATED passive tree (scripts/gen-passive-tree.mjs): nodes, positions, stats, links
    index.ts              typed content loader
docs/
  combat.md               stats, damage and defence formulas
  skills.md               skill/support/trigger system, gems, attributes, weapon attack
  skill-catalog.md        full skill/support/legendary list with inspirations + build waves
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

**Step 1, stats & combat core (done):** modifiers + `computeStats()`,
PoE2-style hit pipeline (armour, entropy evasion, resistances, crits),
levels/XP carried between zones, Str/Dex/Int with small bonuses, mana pool +
regen, monster level = 1 + zones cleared with per-level scaling, character
sheet (C / Options).


**Step 2, push 1 (done):** skill engine (compile → cast → step; melee and
projectile deliveries; hit/end/kill triggers; depth 3, 400-projectile
budget), Frost Bolt, supports Volley/Pierce/Chain/Fork/Shatter, weapon
attacks (Sword melee, Bow and Wand projectiles) that take supports,
dodge roll (○/Space, invulnerable to contact while rolling), 4 skill slots
with mana costs, skill bar, pause menu with a debug loadout editor.
**Auto attack removed** at the user's request: the weapon attacks only while
R2 / left click is held; aim assist stays.



**Step 2, push 2 (done):** area deliveries (circle burst / forward cone,
blocked by walls), lobbed projectiles, damage conversion (`convertTo`),
skill-level mods; ailments chill/freeze/ignite (rules in `combat.json`,
`MonsterState.ailments`); skills Fireball, Earthsplitter, Fanning Shot, Ice
Nova, Magma Strike; supports Echo (`repeat`), Cast on Kill (`trigger`: the
skill casts itself at the corpse, its button is disabled), Added Cold,
Concentrated, Knockback. Wave 1 of docs/skill-catalog.md is complete.


**Step 3, gems as loot (done):** drop tables (`drop-tables.json`, nestable;
the end-arena pack uses `zoneGen.endPackDropTable`), ground items picked up
with ✕/F (`gems.pickupRange`), the **character save** (`CharacterSave`:
level, XP, zones cleared, weapon, skill bar of skill gems with their own
support sockets, weapon-attack sockets, 40-slot bag) persisted in
localStorage (`src/client/save/storage.ts`) and passed between zones.
Skill gems level from kill XP (`gems.json`: +damage per level, sockets
2 → 5). Inventory changes go through `inventoryCommand()` (equip, unequip,
socket, unsocket, debug give/weapon). Starting kit: Frost Bolt + 1 random
support. Duplicate supports allowed. Death keeps everything and costs
`progression.deathXpPenalty`% of the level's XP (never a level). Menu tabs:
Character, Inventory (controller-first grid + picker), Debug.

**Polish after step 3 (done):** Cast on Kill now smart-targets: the
triggered skill's root delivery aims at the nearest visible enemy near the
corpse (children such as Shatter shards keep their own patterns). Life and
mana **leech** (`life_leech` / `mana_leech` stats, % of damage dealt, paid out
at up to `combat.leech.maxRate`% of max per second); supports Life Leech and
Mana Leech; gear will grant the same stats.

**Gear (done):** 26 item bases (`item-bases.json`; weapons are items and
point at `weapons.json`, Fists when unarmed), 29 prefix/suffix affixes with
tiers gated by item level and a magic-name word each (`affixes.json`),
rarities normal/magic (1+1)/rare (3+3, 4–6 mods, random name)/unique, 5
uniques (`uniques.json`, some `grants` a support to every fitting skill),
rarity weights and rare names in `gear.json`. Monsters drop gear at their
level (`drop-tables.json` kinds `item` / `unique`). 10 equipment slots;
equipped gear feeds `computeStats()` (incl. attributes, leech, movement
speed); level/attribute requirements. `src/sim/items/gear.ts` rolls items,
turns gear into modifiers/grants, and makes tooltip text. Save v2 adds
`equipment` (`migrateSave` upgrades v1). Menu tabs: Character, Gear (rarity
coloured list, tooltips with tiers, comparison with what's worn), Gems,
Debug (spawn gems, random gear by rarity, uniques, rare weapons).

**Gear QoL + gem rework (done):** when both rings are worn, ←/→ picks which
one a new ring replaces. Selecting gear shows **green/red stat changes**
(`previewInventoryCommand` runs the command on a cloned world;
`src/sim/items/compare.ts` diffs life, mana, defences, resistances,
attributes, move speed and every skill's DPS). **Gems no longer level from
XP**: feed a duplicate skill gem into an equipped one (`level_gem`; the copy
adds its own level) up to `gems.maxLevel` (10); sockets 2/3/4/5 at levels
1/3/6/9. Support gems don't level; duplicates are just more copies. A
crafting currency that levels gems comes with crafting. Unequipping or
swapping a skill gem returns its socketed supports to the bag.

**Currency + salvage (done):** 11 currencies (`currencies.json`, the table
above minus Essences) each pointing at a sim effect in
`src/sim/items/crafting.ts`, plus 5 fragment currencies that combine 10 → 1
automatically. Monsters drop currency (`drop-tables.json` kind `currency`,
gated by `dropLevel`). **Save v3** splits storage: `gearBag` (40,
`gear.bagSize`), `gemBag` (40, `gems.bagSize`) and an unlimited `currency`
stash; `migrateSave` splits old bags. **Salvage** destroys bagged items for
fragments (`crafting.json`: normal → Whetstone, magic → Crown Ember, rare →
Chaos Thread, unique → Void Pearl, gems → Cutter's Prism, more per gem
level): one at a time in the Gear tab (□ / X, rares and uniques ask twice)
or in bulk from the Currency tab. Crafting rolls use the world rng
(`apply_currency` command). Void Pearl corrupts (nothing / reroll as rare /
a mod gains a tier / lose a mod; uniques reroll or get perfect values) and
locks the item. Menu tabs: Character, Gear, Gems, Currency, Debug.

**Cairnstones + map mods (done):** a Cairnstone (`CairnstoneItem`: level,
rarity, mods) opens a map whose monster level is the stone's level. 11 map
mods (`map-mods.json`, same `Affix` format as gear so every currency works on
stones): monster life/damage/speed/crit, extra fire/cold/lightning damage,
monster resistances/evasion/armour, pack size; each also adds item quantity
or item rarity. `world.mapStats` sums them; the sim applies them in
`spawnMonster`, `monsterDefences`, monster contact hits and `mapDrops` /
`lootContent` (quantity = extra drop-table rolls, rarity = gear rarity
weights). **Every cleared map gives a Cairnstone** (`zone_complete.reward`,
`levelUpChance`% one level higher) and monsters drop them (kind
`cairnstone`). Without a stone you run a **free map**
(`freeMap()`: `bestMapLevel − levelsBelowBest`, 0–2 lowest-tier mods).
`MapRun` (seed, level, mods, deaths, `maxDeaths?`) lives in
`save.currentMap` while running, so a death retries the same map;
`maxDeaths` is unset = unlimited (hook for a future limit). Save v4 adds
`stoneBag` (60), `bestMapLevel`, `currentMap`; v3 saves get a stone at the
level they had reached. Client: Map Device between maps (✕ open, □/X
salvage, Options → Currency tab to craft stones), HUD shows map name, mods
and rewards. `zonesCleared` is now just a counter.

**Hideout + stash + map shapes (done):** between maps you're in the
**hideout** (`hideout.json`, `src/sim/zone/hideout.ts`): a safe room with no
monsters and three **stations** used with ✕ (`interact` event,
`nearestStation`): Map Device (opens maps; the free map preview uses the
same seed it opens with), Stash (`save.stash` gear/gems/stones, 120 each,
`stash` command), Crafting Bench (menu Currency tab). Clearing a map returns
to the hideout; on death ✕ retries, ○ abandons the map and returns. Save v5
adds `stash`. Menu gained a **Stones** tab (craft stones with any usable
currency, repeatable; salvage). Map **layouts** (see Zones).

**Monsters, rarity, bosses, portal (done):**
- **Portal:** T / D-pad ↑ opens a portal (`world.portal`) a step ahead; ✕ on it
  goes home with the map world kept in memory (`SceneData.suspended`); the
  hideout gets a portal back (`hideoutRun(def, true)`), and `rejoinMap()`
  continues the same map with the character as it is now. A refresh while
  home restarts the open map from scratch (it's still `save.currentMap`).
- **Monster attacks** (`src/sim/monsters/attacks.ts`, `Monster.attacks`):
  projectile (fan / 360° ring), slam (warning circle at the player's spot),
  nova (around itself), summon; all with a windup (yellow ring on the
  monster), all avoidable by dodge roll, all through `hitPlayer()`. Ranged
  monsters back off to `keepDistance`. Frozen monsters lose their cast.
- **New enemies:** Bone Archer, Ember Acolyte (fire), Frost Acolyte (cold
  fan), Bloated Brute (slam), Skitterling (fast, evasive, big swarms).
  Packs are mostly one kind (`STRAY_CHANCE` mixes others in).
- **Monster rarity** (`monster-rarity.json`, `src/sim/monsters/rarity.ts`):
  packs roll normal / magic (shared 1–2 mods) / rare (named leader, 3–4 mods,
  magic minions) / Legendary (`unique`, 4–5 mods). Rarity multiplies life,
  damage, XP, drop rolls and item rarity; rare/Legendary roll bonus tables.
  13 monster mods in `monster-mods.json` (stats, granted attack, on-death
  attack). Client: coloured ring underfoot, name/mod label, coloured bar.
- **Bosses** (`monsters.json` `boss`, `bosses.json`): the end arena holds a
  **Warden** (3 kinds; rolls normal/magic/rare with milder multipliers) or,
  at `titanChance`% (8), a **Titan** (2 kinds; enrage below 50% life). The
  exit is **sealed** until the boss dies (`world.bossId`, `boss_defeated`).
  Boss bar along the top. An empty monster pool means no boss (tests).
- **Loot rebalance:** trash drops ~12% (gear 4%, currency 4% ×1–2, gems
  3.5%, stones 0.5%); rare/Legendary monsters and bosses carry the loot.

**Passive tree (done):** 214-node tree (see "Character passive tree"),
Passives menu tab (P on keyboard): D-pad hops to the nearest node in that
direction, ✕ allocate, □ refund, △ zoom; side panel with node stats and the
green/red change to your stats (`compareWorlds` on a previewed world).
Keystones: Twin Cast, Piercing Doctrine, Endless Volley, Vampiric Pact,
Juggernaut's Oath, Cataclysm. New currency Lethe Ash (refunds). Save v6 adds
`passives`. HUD nags about unspent points.

### Balance & feel backlog (revisit after gear)

- Cast on Kill chains: cooldown (0.3 s) and damage penalty feel; whether
  triggered skills should cost a little mana.
- Freeze is very strong at low monster levels (Husks have 30 life).
- Drop rates (`drop-tables.json`) and gem XP / socket pacing (`gems.json`).
- Mana costs vs regen (5/s) once gear adds mana and leech.
- Ground label stacking when several items drop together: comes with the
  loot filter (stacked, navigable list of nearby drops to pick from).
- Leech rate cap (20%/s) and whether leech should apply to DoT.
- **Resistances do nothing yet**: every monster deals physical damage. Add
  elemental monsters (and monster mods) so fire/cold/lightning res matter.
- Weapon affixes are global, not PoE "local" (e.g. "% increased physical
  damage" on a weapon boosts all attacks). Fine while one weapon slot exists.
- Gear drop rate (9% of trash) and rarity weights (55/33/11/1).
- Item requirements come from the base only (PoE also uses affix levels).
- **Accuracy barely matters yet**: Husk evasion (20 × 1.07^level) stays far
  below the 0.83 × accuracy needed before attacks can miss, so player
  attacks always hit. Give monsters real evasion (evasive monster types,
  monster mods) so accuracy and the accuracy affix earn their place. Player
  evasion already works against monster accuracy.
- Gem drop rates now need duplicates for levelling: tune skill gem weights.
- Passive tree values (small node sizes, notables, keystone trade-offs) and
  1 point per level are first guesses.
- Monster/boss numbers are first guesses: rarity multipliers, boss life
  (Wardens 330–480 × level scaling, Titans 1250–1500), Titan chance 8%,
  enrage, attack damage/cooldowns; loot from rare packs and bosses.
- Currency drop rate (now 4% of trash ×1–2, more from rare/boss tables), per-currency weights,
  salvage yields; whether Void Pearl outcomes are too swingy.
- Cairnstone economy: drop rate (2% trash, 6% end pack + 1 guaranteed),
  level-up chance (30%), free map level (best − 1), stone bag 60. Map mod
  values/rewards are first guesses. Map events ("low tier events" on free
  maps) arrive with map mechanics.
- **Corruption implicits (wanted):** Void Pearl should be able to add special
  corrupted-only mods (PoE-style corrupted implicits: e.g. +1 socket on a
  gem, "skills chain +1", "cull", "% chance to Echo"), its own pool in
  data, beside the current outcomes.

### Roadmap

1. ~~Gear~~ (done).
2. ~~Crafting currency~~ (done; Essences wait for Essence Prisons).
3. **Art pass** (next; after gear exists, so slots and item types are known):
   extend `tools/pixel-forge.html` with more weapon types, animation frames
   (walk / attack / hit), and paper-doll gear appearance on the character;
   make editing weapon/gear looks easy in the tool.
4. ~~Cairnstones + map mods~~ (done), ~~hideout + stash~~ (done).
5. ~~Monsters: enemy types, rarity, bosses, loot rebalance~~ (done). Next
   candidates: map mods that affect monster rarity / boss (e.g. "+1 rare
   pack", "Titan guaranteed"), more boss abilities (charges, phases).
6. ~~Passive tree~~ (done; grow it: more sectors/wheels, class starts, masteries).
7. The Reach, map mechanics (free maps should also roll low-tier events then),
   loot filter + stacked/navigable ground labels.

**Controller support (done):** DualSense/Xbox via the browser Gamepad API,
twin-stick aim with aim assist, rumble on hits/death, prompts swap between
keyboard and PlayStation glyphs, connect/disconnect toasts.

Dev helpers: `?seed=123` in the URL pins the first zone; in dev builds
`window.__game.world` exposes sim state for debugging/automated play.
