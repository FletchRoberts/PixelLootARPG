# Combat math: stats, damage and defences

Status: **proposal**, the reference for Phase 3 (gear and loot). Nothing here
is implemented yet except the placeholder melee/contact damage.

We copy Path of Exile 2's structure, simplified where PoE's complexity doesn't
earn its keep yet, and keep every constant in data so we can tune it.

## Why PoE-style rather than Diablo 4 or Last Epoch

| Game | Armour model | What it means for us |
|------|--------------|----------------------|
| **PoE 2** | `DR = A / (A + 10 × hit)`, depends on hit size | Armour shrugs off many small hits but barely dents one huge slam. Bosses stay scary without special cases, and no level term is needed because it scales with the hit. **Chosen.** |
| Diablo 4 | Flat % reduction vs monster level, capped at 85% | Easy to read, but once capped, armour stops mattering, and every value needs a level table. |
| Last Epoch | % from armour vs area level, cap 85%, 70% effective vs non-physical | Middle ground, but still needs level tables to stay balanced. |

Resistances in all three are a plain capped percentage; we use PoE's.
Separate "damage reduction" sources **multiply** (`1 − Π(1 − DRᵢ)`), as in
both PoE and D4. That stops reduction from stacking to 100%.

## 1. Stats and modifiers (the core of everything)

Every number on a character or monster is a **stat id** (`life`,
`armour`, `fire_resistance`, `physical_damage`, `attack_speed`, …).
Gear affixes, passives, buffs and monster mods all produce **modifiers**:

```ts
{ stat: "physical_damage", kind: "flat" | "increased" | "more", value: number, tags?: ["attack", "melee"] }
```

```
final = (base + Σ flat) × (1 + Σ increased / 100) × Π (1 + more / 100)
```

- **increased/reduced** add together into one bucket (reduced is negative).
  Diminishing returns are on purpose: going from 400% to 450% increased is
  only ×5 → ×5.5.
- **more/less** each multiply separately. They're rare and powerful, and
  mostly come from skills, keystones and uniques.
- **Tags** scope modifiers: "increased melee physical damage" applies only to
  hits tagged melee and physical.
- One sim function, `computeStats(sources) → StatBlock`, is used for combat
  *and* tooltips, so displayed numbers can never drift from real ones.

## 2. Damage types

`physical`, `fire`, `cold`, `lightning`, `chaos`. Each hit carries a
min–max range per type. Elemental ailments (ignite, chill, shock) and
conversion ("50% of physical as fire") come later. The pipeline leaves
room for them.

## 3. Outgoing hit (attacker side)

1. **Base**: weapon damage range per type (attacks) or skill base damage
   (spells).
2. **Added flat** damage per type from gear ("adds 3–7 fire damage").
3. *(later)* **Conversion** between types.
4. **Scaling** per type: `(1 + Σ increased) × Π more`, using modifiers whose
   tags match the hit.
5. **Roll** each type uniformly in its min–max range (seeded `Rng`).
6. **Critical hit**: chance from the weapon/skill base (e.g. 5%) ×
   (1 + increased crit chance), capped at 100%. A crit deals +100% damage by
   default (data: `critBonusBase`), plus any crit bonus modifiers.
7. Speed: attacks per second = weapon base × (1 + Σ increased attack speed).
   DPS in tooltips = average hit × hit chance × crit factor × speed.

## 4. Incoming hit (defender side), in order

1. **Evasion vs accuracy** (attacks only; spells always hit).
   PoE 2 constants: `chanceToHit = clamp(1.25 × acc / (acc + 0.3 × eva), 5%, 100%)`.
   Instead of a coin flip we propose PoE's **entropy** model: each defender
   keeps a counter, starting at a random value in [0, 1). Each incoming
   attack adds its hit chance to the counter. If the counter reaches 1, the
   attack hits and 1 is subtracted; otherwise it's evaded. At 25% hit chance
   you're hit exactly once every 4 attacks, so there are no streaks of bad
   luck, and it's deterministic, which suits the seeded sim.
2. *(later)* **Block**: flat chance from shields, cap 75%, blocks most of
   the hit.
3. **Armour vs physical**: `DR = A / (A + 10 × physical)`, capped at 90%.
4. **Resistances** per element: `damage × (1 − R / 100)`.
   - Cap 75% by default; "+max resistance" can raise it to a hard 90%.
   - Can go negative (floor −100%); negative resistance means extra damage.
   - **Penetration** lowers the *capped* resistance for that hit only
     (75% capped and 30% penetration means the hit treats it as 45%).
   - PoE 2 gives players −60% resistance in endgame. We have no campaign,
     so we start at 0 and keep a per-tier `resistancePenalty` knob in data
     in case harder tiers need it.
5. **Other reduction** ("10% less damage taken"), multiplied together.
6. *(later)* **Energy shield** absorbs before life. Then **life**.

Monsters go through exactly the same pipeline. A monster is a stat block
with modifiers, just like the player.

### Worked example (tier 1 Husk vs player)

The Husk hits for 10 physical.

| Player armour | DR vs 10 dmg | Damage taken | DR vs a 100-dmg boss slam |
|---|---|---|---|
| 0 | 0% | 10 | 0% |
| 50 | 33% | 6.7 | 5% |
| 200 | 67% | 3.3 | 17% |
| 500 | 83% | 1.7 | 33% |

That's exactly the behaviour we want: armour trivialises trash while bosses
still need respect.

## 5. Monster scaling

- **Monster level** comes from the zone tier (later the Cairnstone tier).
  It's also the **item level** of drops, which gates affix tiers.
- `src/data/monster-scaling.json`: a per-level table of multipliers for life,
  damage, accuracy, evasion and armour. Start with a simple exponential
  curve (e.g. life ×1.10 and damage ×1.08 per level) and hand-tune the
  table later. Gear and passives have to outpace it; that's the whole game.
- **Monster rarity** (later): magic packs get extra life and one or two mods;
  rares get much more life, several mods and better drops. Each mod is just
  a modifier list in data.

## 6. Player base stats (proposal)

- Life 100 at level 1. Life, armour, evasion, accuracy and resistances come
  mainly from gear and passives.
- Base crit bonus +100%, max resistances 75%, base accuracy and evasion
  small, so unequipped characters feel weak.
- Open questions (below): attributes, mana, energy shield, levels.

## 7. Implementation plan (Phase 3)

1. `src/sim/stats/`: stat ids, modifier type, `computeStats()`, tests
   with hand-checked numbers.
2. `src/sim/combat/`: `rollHit(attacker, skill, rng)` and
   `applyHit(defender, hit, rng)` implementing sections 3–4, with tests per
   step (including the armour table above).
3. Switch the current melee swing and Husk contact damage over to them, so
   current behaviour is reproduced through the new path.
4. Item bases and affixes in data whose mods are modifier lists. Then drops,
   pickup, an inventory/equipment screen (fully controller-navigable) and
   tooltips built from `computeStats()`.

## Sources

- PoE 2 armour formula `A / (A + 10 × D)`: [Mobalytics PoE 2 armour guide](https://mobalytics.gg/poe-2/guides/armour), [PoE 2 wiki: Armour](https://www.poe2wiki.net/wiki/Armour)
- PoE 2 hit chance `1.25 × acc / (acc + 0.3 × eva)`, 5% floor, entropy: [Mobalytics PoE 2 evasion](https://mobalytics.gg/poe-2/guides/evasion), [Mobalytics PoE 2 accuracy](https://mobalytics.gg/poe-2/guides/accuracy), [PoE 2 wiki: Evade](https://poe2wiki.net/wiki/Evade)
- PoE 2 resistances (75%/90% caps, penetration, −60% endgame penalty): [PoE 2 wiki: Resistances](https://poe2wiki.net/wiki/Resistances)
- Increased vs more modifiers: [PoE forum: additive and multiplicative modifiers](https://www.pathofexile.com/forum/view-thread/892570)
- Diablo 4 armour/resistance caps, multiplicative DR: [Maxroll D4 defenses](https://maxroll.gg/d4/getting-started/defenses-for-beginners), [Mobalytics D4 defenses deep dive](https://mobalytics.gg/?p=66627)
- Last Epoch armour (area-level scaling, 85% cap, 70% vs non-physical): [Last Epoch support article](https://support.lastepoch.com/hc/en-us/articles/46361891210651/)

The PoE 2 constants come from community guides and wikis, and patches change
them; they're starting points, all kept in data.
