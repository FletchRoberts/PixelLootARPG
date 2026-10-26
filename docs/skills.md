# Skills, supports and build-defining gear

Status: **partly implemented**; gems are real items since step 3 (see
`src/sim/items/`). Projectile and melee deliveries, hit/end/kill
triggers, stat + structure supports, limits and weapon attacks are in
`src/sim/skills/`. Areas, zones, status effects and the rest come in later
waves. Pairs with `docs/combat.md` (the damage math).

The goal is PoE's skill + support gem depth, with the kind of chain
reactions Noita wand-building and Vampire Survivors evolutions produce:
pieces that are simple alone but multiply each other when combined.

## Pillars

1. **Composable, not special-cased.** No "if frost bolt and shatter" code.
   Supports and gear change a skill through one generic system, so
   interactions nobody designed still happen.
2. **Readable chaos.** Big screens of effects are fine, but every effect
   comes from something the player chose and can see in a tooltip.
3. **Bounded.** Chain reactions always end (depth limit, proc coefficient,
   entity budget). They feel explosive without crashing the game or the
   network later.
4. **Data, not code.** Skills, supports and legendary effects are JSON. Code
   provides a small set of reusable building blocks.

## Core model: a skill is a tree of deliveries

Everything a skill does is a **delivery** (the thing that carries damage)
plus **triggers** that spawn more deliveries.

| Delivery | Examples |
|----------|----------|
| `melee` | slash arc, slam, thrust |
| `projectile` | frost bolt, arrow, shard |
| `area` | nova, ground explosion, aura pulse |
| `beam` / `chain` | lightning arc between targets |
| `zone` | burning ground, frost field (ticks over time) |
| `orbit` | blades circling the player (Vampire Survivors King Bible) |
| `summon` | minion, totem or turret that uses its own skill |

Each delivery has **tags** (`projectile`, `spell`, `attack`, `cold`,
`area`, …), base stats (damage, speed, count, radius, duration, pierce,
chain …) and triggers:

```
on: hit | kill | expire | crit | bounce | tick | cast
→ spawn another delivery, or apply an effect (chill, ignite, knockback, pull, buff)
```

Frost Bolt is one node: a cold projectile. A "split into shards" support
adds a child node: on hit or expire, spawn 5 projectiles in a ring.

## Supports: two kinds of change

**1. Stat modifiers.** These use the same flat/increased/more modifiers as
gear (`combat.md`), scoped by **tags**. They apply to every delivery in the
tree that matches, *including children added by other supports*.

**2. Structure changes.** A support can add a trigger/child ("shatter on
expire"), add a behaviour (pierce, chain, fork, return, orbit, home), or
repeat the cast (echo, multicast).

### Your example, worked through

| Socketed in Frost Bolt | Effect |
|---|---|
| **Volley** (+2 projectiles to `projectile`, 25% less damage) | 3 bolts |
| **Shatter** (on expire/hit: spawn 5 `projectile` shards, 40% damage effectiveness) | each bolt bursts into shards |

Because Volley's +2 applies to *every* projectile delivery, and the shards
are projectiles, each burst becomes **7** shards. That gives 3 bolts × 7
shards = **21** shards. Add **Chain** (+1 chain to `projectile`) and both
the bolts and the shards chain. Nobody wrote a rule for "Volley + Shatter";
it falls out of tags.

Modifiers can also set a **scope** when we *want* to restrict them:
`root` (only the main delivery), `children`, or `all` (default). A
legendary could say "Shatter shards gain +3 projectiles" (`children`), or
a support could add projectiles to the main bolt only (`root`).

### Example support list (starting point)

| Support | Kind | Inspired by |
|---|---|---|
| Volley: +2 projectiles, less damage | stat | PoE Multiple Projectiles |
| Shatter: on expire, burst into 5 shards | structure | Noita trigger spells |
| Chain: projectiles chain +1 | stat | PoE Chain |
| Pierce: pierce +2 | stat | PoE Pierce |
| Fork: on first hit, split in two | structure | PoE Fork |
| Echo: repeat the cast 0.3 s later | structure | PoE Spell Echo, Noita multicast |
| Boomerang: projectiles return | structure | Vampire Survivors Cross |
| Orbit: projectiles circle you instead | structure | Vampire Survivors King Bible |
| Trigger on Kill: cast linked skill on kill | structure | PoE Cast on Kill |
| Trigger on Crit: cast linked skill on crit | structure | PoE Cast on Crit |
| Leaving Trail: deliveries leave burning/chilling ground | structure | PoE2 trails |
| Concentrated: bigger and slower, more damage | stat | PoE Concentrated Effect |
| Elemental Reaction: chilled + fire hit = steam blast | effect | Magicka, Genshin reactions |
| Overcharge: every 4th cast is empowered | structure | WoW procs, PoE2 combos |

## Gems, sockets and attributes

- **Skill gems** grant skills. **Support gems** go into a skill gem's
  sockets, PoE 2-style: the socket lives on the gem, not on the armour, so
  gear choice and skill choice don't fight. A gem starts with 2 support
  sockets and gains up to 5 through gem level or a currency.
- Gems have **levels** (raise base damage) and are coloured by attribute:
  **Strength** (red, melee/armour), **Dexterity** (green,
  projectiles/evasion), **Intelligence** (blue, spells/elements).
- Gems and gear have **attribute requirements**. Attributes also give
  small bonuses:
  - **Strength:** +life, +melee damage
  - **Dexterity:** +accuracy, +evasion, +attack speed
  - **Intelligence:** +mana, +energy shield (later), +elemental damage

  The exact numbers live in data.
- **Mana** arrives with skills: each skill has a cost, and supports
  multiply it (Volley ×1.4), so stacking supports has a real price.

## Character levels

- XP from kills, scaled by monster level vs character level.
- Each level: +passive point, + a little base life/mana, +attribute points
  or a choice of one (to decide during tuning).
- Levels also gate gem levels and gear (level requirement).

## Weapon attack

Every weapon grants a **weapon attack** using the weapon's damage, speed and
range: a sword swings, a bow fires arrows, a wand shoots bolts. It is used
by holding **R2 / left click**. **It takes supports like any skill**, so a
Fork + Chain wand attack is already a build. Skills sit on R1/□/△/L1
(keyboard: right click/Q/E/R).

**Decided:** no auto-attacking (it was tried and removed). On controller,
**aim assist** points attacks and skills at the nearest visible enemy when
the right stick is idle. Per-weapon attacks are listed in `skill-catalog.md`.

## Gear that changes skills

Gear uses the same modifier and structure-change system, so a piece of gear
is "a support you wear" with a scope.

- **Basic affixes** (normal/magic/rare): stat modifiers with tags.
  "+1 projectile to Bow skills", "+15% area of Cold skills",
  "+1 level of all Dexterity gems", "10% chance to Echo".
- **Legendaries (uniques)** change *structure*, often in ways that create new
  builds:
  - "Your projectiles orbit you before firing" (wand)
  - "Shatter shards are always critical hits"
  - "Supports in this gem also apply to the skills it triggers"
  - "Every 5th weapon attack casts your linked spell" (WoW proc / PoE2 combo)
  - "Chill also counts as burning" (elemental reaction enabler)
  - "Armour also reduces elemental hits at half value" (defensive identity)
- **Evolutions** (Vampire Survivors): specific gem + specific legendary or
  passive combos unlock an evolved skill. Rare, discoverable, data-defined.

## Keeping the chaos bounded

| Limit | Rule |
|---|---|
| **Depth** | At most 3 generations of triggered children per cast; past that, triggers don't fire. |
| **Proc coefficient** (Risk of Rain 2) | Each delivery has a 0–1 proc coefficient; children multiply it down, and "on hit/kill" chances scale by it. That ends loops naturally. |
| **Damage effectiveness** | Children deal reduced damage (e.g. shards 40%), so splitting multiplies coverage more than raw damage. |
| **Entity budget** | Max live projectiles/areas per player (e.g. 400). New spawns past the budget merge into the nearest existing one or are skipped. |
| **No self re-trigger** | A trigger can't fire the skill that contains it. |
| **Determinism** | Every roll goes through the seeded `Rng`, so a cast plays out identically on host and clients. |

## How it runs (sim architecture)

1. **Compile** when gear, gems or passives change. Gem + supports + gear +
   passive modifiers become a `CompiledSkill`: a resolved delivery tree
   with final stats per node (cached, plain data). Tooltips render from it,
   including "this cast fires 3 bolts → 21 shards".
2. **Cast** at runtime: spawn the root deliveries into world state
   (`projectiles[]`, `areas[]`, … plain data).
3. **Step**: move deliveries, test hits, fire triggers (spawning children
   with depth+1, proc coefficient multiplied), then expire.
4. Data:

```json
// skills.json
{ "id": "frost_bolt", "name": "Frost Bolt", "attribute": "int", "tags": ["spell", "projectile", "cold"],
  "cost": { "mana": 8 }, "castTime": 0.6, "supportSockets": 2,
  "root": { "delivery": "projectile", "speed": 520, "range": 600, "radius": 8, "count": 1,
            "damage": { "cold": [6, 10] }, "on": { "hit": [{ "effect": "chill" }] } } }

// supports.json
{ "id": "volley", "requires": ["projectile"], "costMultiplier": 1.4,
  "mods": [{ "stat": "count", "kind": "flat", "value": 2, "tags": ["projectile"] },
           { "stat": "damage", "kind": "more", "value": -25 }] }
{ "id": "shatter", "requires": ["projectile"], "costMultiplier": 1.3,
  "add": { "to": ["projectile"], "scope": "root", "on": "expire",
           "spawn": { "delivery": "projectile", "pattern": "ring", "count": 5, "tags": ["projectile"],
                      "damageEffectiveness": 0.4, "procCoefficient": 0.5, "inherit": ["damage_types", "effects"] } } }
```

## Proposed build order

1. **Stats + combat core** (`combat.md` §1–4), levels/XP, attributes, mana.
   Rebuild the current sword swing on top of it.
2. **Skill engine:** deliveries, triggers, compile/cast/step, limits.
   Prove it with **Frost Bolt + Volley + Shatter + Chain** and the
   weapon attack, with a debug panel to swap supports live.
3. **Gems as items**, socketing UI (controller-first), skill bar.
4. **Gear:** bases, affixes, rarities, drops, inventory, tooltips.
5. **Legendaries and evolutions** on top of 2–4.
