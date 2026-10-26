# Skill catalog

Status: **design catalog**. The full menu of skills, supports, auto attacks
and skill-changing gear we intend to build, using the engine in
`docs/skills.md`. Names are ours; the "From" column credits the inspiration.
Numbers come later, in data.

Frost Bolt + Volley + Shatter (3 bolts → 21 shards) is just *one* example of
what these pieces do together. The point of the catalog is that almost any
skill here combines with almost any support whose tags match.

**From:** PoE = Path of Exile, PoE2 = Path of Exile 2, VS = Vampire
Survivors, WoW = World of Warcraft, Noita, Magicka, RoR2 = Risk of Rain 2,
WoL = Wizard of Legend.

**Delivery** (see `skills.md`): `melee`, `projectile`, `area`, `chain`,
`beam`, `zone`, `orbit`, `summon`, plus built-in triggers (⤷).

---

## 1. Auto attacks (one per weapon type)

Always on: fires at the nearest enemy in range at the weapon's speed, and
takes supports like any skill. The weapon decides the auto attack, so
swapping weapons changes how the character plays.

| Weapon | Auto attack | Delivery / tags | From |
|---|---|---|---|
| Sword | **Slash**: 120° arc in front | melee, physical | PoE2 default attack |
| Axe | **Cleave**: wide 180° arc, slower, heavier | melee, area, physical | PoE Cleave |
| Mace | **Pound**: small slam at the target's feet | melee, area, physical, stun | PoE2 maces |
| Dagger | **Stab**: very fast single target, high crit | melee, physical | PoE daggers |
| Spear | **Thrust**: long narrow line, pierces | melee, physical | PoE2 spears |
| Quarterstaff | **Sweep**: 360° spin around you | melee, area, physical | PoE2 quarterstaff |
| Flail | **Lash**: horizontal strike both sides | melee, physical | VS Whip |
| Bow | **Shoot**: single arrow | projectile, physical, attack | PoE bows |
| Crossbow | **Bolt Shot**: slow, piercing, reload every 6 | projectile, physical, attack | PoE2 crossbow |
| Wand | **Spark Bolt**: fast magic bolt | projectile, spell-like, element by wand | Noita Spark Bolt, VS Magic Wand |
| Staff | **Orb**: slow orb that pulses small damage | projectile, area, element by staff | PoE2 staff, VS |
| Sceptre / Tome | **Familiar**: a spirit orbits and shoots | summon, projectile | VS Peachone, PoE2 spirit |
| Unarmed | **Jab**: weak fast punch | melee, physical | — |

---

## 2. Active skills

Each has an attribute colour (gem colour + requirement).

### Strength: warrior, melee, slams, warcries

| Skill | What it does | Delivery / tags | From |
|---|---|---|---|
| **Earthsplitter** | Slam sending a fissure forward | melee, area, physical, slam | PoE Ground Slam, Sunder |
| **Aftershock** | Slam; ⤷ a second, bigger area hits 1 s later | melee, area, slam, ⤷delay | PoE Earthquake |
| **Vaulting Crash** | Leap to a point and slam on landing | movement, area, slam | PoE Leap Slam |
| **Bladestorm** | Channel: spin while moving, hitting all around | melee, area, channel | WoW Bladestorm, PoE Cyclone |
| **Bonebreaker** | Heavy single hit; ⤷ stunned enemies release a shockwave | melee, physical, stun | PoE Boneshatter |
| **Bull Rush** | Dash through enemies, knocking them aside | movement, melee | PoE Shield Charge, WoW Charge |
| **Thunderclap** | Area around you, slows enemies | area, physical, lightning | WoW Thunder Clap |
| **Executioner's Chop** | Huge bonus against low-life enemies | melee, physical | WoW Execute, PoE Culling |
| **Magma Strike** | Melee hit; ⤷ 3 lobbed magma balls land as small blasts | melee, projectile, area, fire | PoE Molten Strike |
| **Arcing Edge** | Melee hit; ⤷ fires lightning projectiles from the target | melee, projectile, lightning | PoE Lightning Strike |
| **Spike Field** | Raise spikes in a line; warcries/slams detonate them | area, physical, ⤷detonate | PoE2 Earthshatter / Perforate |
| **Battle Roar** | Warcry: taunt and empower your next 3 attacks | warcry, buff | PoE2 warcry empower, WoW Battle Shout |
| **Blink Strike** | Teleport to an enemy and hit; repeats on kill | movement, melee | PoE Flicker Strike |
| **Molten Shell** | Shield absorbs damage; ⤷ explodes when broken | buff, area, fire, ⤷on break | PoE Molten Shell |
| **Whirling Axe** | Lob a spinning axe in an arc that pierces everything | projectile, physical | VS Axe |
| **Hammer Orbit** | Hammers circle you, hitting what they pass | orbit, physical | VS King Bible, PoE Blade Vortex |

### Dexterity: ranger, projectiles, poison, traps

| Skill | What it does | Delivery / tags | From |
|---|---|---|---|
| **Fanning Shot** | Fire 5 arrows in a cone | projectile, physical, attack | PoE Split Arrow |
| **Arrow Rain** | Arrows fall over a target area for 2 s | area, projectile, attack | PoE Rain of Arrows |
| **Twister Shot** | Arrow flies to the cursor; ⤷ bursts into arrows in all directions | projectile, ⤷on expire | PoE Tornado Shot |
| **Rime Arrow** | Arrow; ⤷ on hit a cone of icy shards continues behind | projectile, cold, ⤷on hit | PoE Ice Shot |
| **Fuse Arrow** | Arrows stick and stack; ⤷ detonate at 5 stacks or after 2 s | projectile, fire, stacks | PoE Explosive Arrow |
| **Blight Arrow** | Arrow; ⤷ leaves a poison cloud where it lands | projectile, zone, chaos, poison | PoE Caustic Arrow |
| **Lightning Rod** | Arrow plants a rod; ⤷ your other lightning hits arc to rods | projectile, lightning | PoE2 Lightning Rod |
| **Flurry** | Rapid stream of arrows at one target | projectile, attack, channel | PoE Barrage, WoW Rapid Fire |
| **Ricochet Blade** | Thrown blade flies out and returns, hitting twice | projectile, physical, return | PoE Spectral Throw, VS Cross |
| **Knife Fan** | Rapid knives in your facing direction | projectile, physical | VS Knife |
| **Bouncing Rune** | Projectile that bounces off walls for 4 s | projectile, bounce | VS Runetracer, Noita Bouncing Burst |
| **Viper Fang** | Fast melee strike, strong poison | melee, chaos, poison | PoE Viper Strike |
| **Blade Trap** | Throw a trap; ⤷ when triggered, spinning blades | trap, area, physical | PoE Blade Trap |
| **Cluster Charges** | Throw 3 mines; ⤷ detonate together | mine, area, fire | PoE mines |
| **Ballista** | Place a totem that auto-fires your arrows | summon (totem), projectile | PoE Ballista Totem |
| **Smoke Dash** | Dash leaving smoke that blinds enemies | movement, zone | PoE Smoke Mine, WoL dash |
| **Gas Arrow** | Poison cloud; fire hits ignite it into an explosion | zone, chaos, reaction | PoE2 Gas Arrow |

### Intelligence: mage, elements, curses, minions

| Skill | What it does | Delivery / tags | From |
|---|---|---|---|
| **Frost Bolt** | Cold projectile, chills | projectile, cold, spell | PoE2 Frostbolt, WoW Frostbolt |
| **Fireball** | Fire projectile; ⤷ small explosion on hit, ignites | projectile, area, fire, spell | PoE / WoW Fireball |
| **Arc** | Lightning that chains between enemies | chain, lightning, spell | PoE Arc, WoW Chain Lightning |
| **Spark** | Several erratic, wandering projectiles | projectile, lightning, spell | PoE Spark |
| **Ice Nova** | Ring of cold around you, freezes chilled enemies | area, cold, spell | PoE Ice Nova, WoW Frost Nova |
| **Ice Lance** | Fast shard; huge bonus vs frozen enemies, shatters them | projectile, cold, spell | WoW Ice Lance |
| **Pyroblast** | Long cast, enormous fireball | projectile, area, fire, spell | WoW Pyroblast |
| **Living Bomb** | Burn on a target; ⤷ explodes on expire/death, spreading to neighbours | DoT, area, fire, ⤷on expire | WoW Living Bomb |
| **Ball Lightning** | Slow orb zapping everything near it as it travels | projectile, area, lightning | PoE Ball Lightning |
| **Blizzard** | Channel: ice shards fall over a large area | area, cold, channel | WoW Blizzard, PoE Vortex |
| **Meteor** | Delayed huge impact at the target | area, fire, spell, ⤷delay | PoE2 / WoW Meteor |
| **Flamethrower** | Channel: cone of fire that ramps up | beam, fire, channel | PoE Incinerate |
| **Flame Wall** | Wall of fire; your projectiles passing through gain fire damage | zone, fire, ⤷modify passing | PoE2 Flame Wall |
| **Storm Sigil** | Attach a sigil to an enemy; it zaps nearby enemies, jumps on death | brand, lightning | PoE Storm Brand |
| **Arcane Missiles** | Channel: homing missiles stream at targets | projectile, arcane, homing | WoW Arcane Missiles |
| **Void Sphere** | Slow orb that pulls enemies in, then collapses | projectile, area, chaos, pull | Noita Black Hole |
| **Drill Bolt** | Fast bolt that passes through walls | projectile, physical, wall-pierce | Noita Luminous Drill |
| **Chainsaw** | Tiny instant-cast short-range bolts, spammable | projectile, physical, no cast time | Noita Chainsaw |
| **Essence Drain** | Projectile applying a chaos DoT; ⤷ Contagion spreads it on death | projectile, DoT, chaos | PoE Essence Drain + Contagion |
| **Hex of Pain** | Curse an area: take more damage, DoT | curse, chaos | WoW Shadow Word: Pain, PoE curses |
| **Frostbite Hex** | Curse: lower cold resistance, frozen enemies take more | curse, cold | PoE Frostbite |
| **Bone Spear** | Piercing bone projectile, crits shatter into fragments | projectile, physical, pierce | PoE2 Bone Cage / Spear |
| **Raise Skeletons** | Summon skeleton warriors | summon, minion | PoE Summon Skeletons |
| **Skeletal Mage** | Summon a caster minion that uses a linked spell | summon, minion, ⤷cast linked | PoE / PoE2 minions |
| **Corpse Burst** | Explode corpses for a share of their life | area, fire, corpse | PoE Detonate Dead |
| **Mirror Image** | Decoys that taunt and copy your casts at low damage | summon, ⤷copy casts | WoW Mirror Image |
| **Flame Dash** | Short teleport leaving burning ground | movement, zone, fire | PoE Flame Dash, WoW Blink |
| **Frost Barrier** | Absorb shield; chills attackers | buff, cold | WoW Ice Barrier, PoE Frost Shield |
| **Elemental Weave** | Queue up to 3 elements, release a combined spell | special, combo | Magicka element combining |

### Hybrid and global (VS-style, any build)

These are weapons that run on their own, like VS weapons. They suit
builds that want a lot happening without pressing buttons.

| Skill | What it does | Delivery / tags | From |
|---|---|---|---|
| **Miasma Aura** | Damaging aura around you; knocks back weak enemies | zone (attached), chaos | VS Garlic |
| **Holy Puddles** | Bottles land near enemies, leaving damaging pools | projectile, zone, holy | VS Santa Water |
| **Storm Call** | Lightning strikes random enemies on a timer | area, lightning, timer | VS Lightning Ring |
| **Beam of Light** | Vertical column sweeps the screen | beam, holy | VS Song of Mana |
| **Twin Familiars** | Two orbiting birds drop bombs | summon, orbit, area | VS Peachone + Ebony Wings |
| **Freezing Clock** | Rotating beam freezes what it touches | beam, cold, rotate | VS Clock Lancet |
| **Cleansing Sigil** | Long cooldown: clear everything on screen | area, ultimate | VS Pentagram |

### Heralds, auras and buffs (reserve mana, always on)

| Skill | Effect | From |
|---|---|---|
| **Herald of Frost** | Killed chilled enemies explode into cold shards | PoE Herald of Ice |
| **Herald of Ash** | Killed enemies explode, igniting nearby enemies | PoE Herald of Ash |
| **Herald of Storms** | Kills fire lightning bolts at nearby enemies | PoE Herald of Thunder |
| **Wrath of Iron** | Aura: more physical damage | PoE Pride, WoW auras |
| **Haste** | Aura: faster movement and attacks | PoE Haste |
| **Elemental Ward** | Aura: +resistances for you and allies | PoE Purity |
| **Bloodlust** | Buff: kills extend a damage/speed buff | WoW Bloodlust, PoE Blood Rage |

---

## 3. Supports

Socket into a skill gem. **Stat** supports change numbers on deliveries with
matching tags (including children from other supports). **Structure**
supports add triggers or behaviours. Every support raises mana cost.

### Projectile
| Support | Kind | Effect | From |
|---|---|---|---|
| **Volley** | stat | +2 projectiles (spread), less damage | PoE Multiple Projectiles, VS Duplicator |
| **Barrage** | stat | Extra projectiles fire one after another instead of spread | PoE Barrage Support |
| **Pierce** | stat | Projectiles pierce +2 enemies | PoE Pierce |
| **Chain** | stat | Projectiles chain +1 to a new target | PoE Chain |
| **Fork** | structure | ⤷ On first hit, split into 2 | PoE Fork |
| **Shatter** | structure | ⤷ On expire/hit, burst into 5 shards | Noita trigger, PoE2 shatter |
| **Boomerang** | structure | Projectiles return to you | VS Cross, PoE Returning Projectiles |
| **Homing** | structure | Projectiles curve toward enemies | WoW Arcane Missiles, Noita Homing |
| **Ricochet** | structure | Bounce off walls, +damage per bounce | Noita Bounce + Damage Plus |
| **Spiral** | structure | Projectiles corkscrew outward | Noita Spiral Arc |
| **Faster / Slower** | stat | Speed ±, slower adds damage and duration | PoE Faster/Slower Projectiles |
| **Payload** | structure | ⤷ Carries a linked spell, cast where it hits | Noita Trigger Bolt |
| **Divide** | structure | Each projectile becomes 2 at half damage (recursive within limits) | Noita Divide By |

### Area
| Support | Kind | Effect | From |
|---|---|---|---|
| **Wider Reach** | stat | +area | PoE Increased AoE, VS Candelabrador |
| **Concentrated** | stat | Smaller area, more damage | PoE Concentrated Effect |
| **Echoing Impact** | structure | ⤷ Area repeats 0.5 s later, larger | PoE Fist of War / Earthquake |
| **Lingering** | structure | Areas leave ground that ticks damage | PoE2 lingering ground |
| **Implosion** | structure | Area pulls enemies to the centre first | Noita Black Hole |

### Casting and repeats
| Support | Kind | Effect | From |
|---|---|---|---|
| **Echo** | structure | Repeat the cast 0.3 s later | PoE Spell Echo, Noita Multicast |
| **Twinned** | structure | Cast twice at once, aimed apart | WoL, Noita Double Spell |
| **Overcharge** | structure | Every 4th cast: double effect | WoW procs, PoE2 combos |
| **Unleash** | structure | Store up to 3 seals while idle, release all at once | PoE Unleash |
| **Charge Up** | structure | Hold to charge; release for scaled damage | PoE2 charge-up |
| **Quickened** | stat | Faster casting/attacking | PoE Faster Casting/Attacks |

### Triggers (link a second skill)
| Support | Fires the linked skill… | From |
|---|---|---|
| **Cast on Kill** | when this skill kills | PoE Cast on Kill |
| **Cast on Crit** | when this skill crits | PoE Cast on Crit |
| **Cast on Hit** | on hit (proc coefficient applies) | RoR2 procs |
| **Cast when Struck** | when you take damage | PoE Cast when Damage Taken |
| **Timer** | every N seconds automatically | Noita Timer trigger, VS weapons |
| **On Expire** | where this skill's deliveries expire | Noita expiration trigger |
| **Last Stand** | below 30% life, once per 10 s | WoW Cheat Death |

### Delivery conversions
| Support | Effect | From |
|---|---|---|
| **Trap** | Skill becomes a thrown trap | PoE Trap |
| **Mine** | Skill becomes mines, detonated together | PoE Mine |
| **Totem** | A totem casts the skill for you | PoE Spell Totem |
| **Orbiting** | Projectiles orbit you before launching | VS King Bible |
| **Familiar** | A small summon casts it on its own | VS / PoE minions |
| **Sigil** | Attach to an enemy and recast on a timer | PoE Brands |

### Element and damage
| Support | Effect | From |
|---|---|---|
| **Added Fire / Cold / Lightning / Chaos** | Add flat damage of that element | PoE Added X |
| **Infuse** | Convert physical to an element | PoE Infernal Legion / conversion |
| **Elemental Reaction** | Element combos explode (chill+fire = steam, shock+cold = shatter, fire+lightning = overload) | Magicka, Genshin |
| **Deep Freeze** | Chill becomes freeze sooner, frozen take more | WoW Shatter, PoE |
| **Spreading Flame** | Ignites spread to nearby enemies | PoE Ignite Prolif |
| **Contagion** | DoTs spread on death | PoE Contagion |
| **Brutality** | More physical, no elemental | PoE Brutality |
| **Precision Strike** | More crit chance and crit bonus | PoE Increased Critical Strikes |
| **Executioner** | More damage vs low-life enemies, cull at 10% | PoE Culling Strike, WoW Execute |
| **Ruthless** | Every 3rd hit deals much more and stuns | PoE Ruthless |
| **Swarm Power** | More damage per live projectile you own | Noita Spells to Power |

### Utility and defence
| Support | Effect | From |
|---|---|---|
| **Life Leech** | Hits heal a share of damage | PoE Life Leech, VS Bloody Tear |
| **Knockback** | Hits push enemies away | PoE Knockback |
| **Fortify** | Melee hits grant damage reduction | PoE Fortify |
| **Lifetap** | Costs life instead of mana | PoE Lifetap |
| **Magnet** | Kills pull loot and XP toward you | VS Attractorb |

---

## 4. Global modifiers (from gear and passives, not gems)

VS-style "passive items": numbers that apply to every skill with matching
tags. Common on gear and the passive tree.

| Modifier | Applies to | From |
|---|---|---|
| +1 projectile | projectile skills | VS Duplicator |
| +% area | area skills | VS Candelabrador |
| +% duration | zones, buffs, DoTs | VS Spellbinder |
| +% projectile speed | projectiles | VS Bracer |
| −% cooldown | all | VS Empty Tome |
| +% cast/attack speed | spells / attacks | PoE |
| +1 to level of X gems | by attribute or element | PoE |
| +% chance to Echo / Fork / Chain | tagged skills | PoE uniques |

---

## 5. Legendaries that change skills (examples)

| Legendary | Slot | Effect |
|---|---|---|
| **Prism of Seven** | wand | Projectiles split into 3, one per element |
| **Orrery Band** | ring | All projectiles orbit you once before firing |
| **The Patient Blade** | sword | Every 5th auto attack casts the linked spell in that gem |
| **Glacier Heart** | body | Shatter shards are always crits; frozen enemies shatter into shards |
| **Echo Chamber** | helmet | Echo also applies to triggered skills |
| **Bloodstone Seal** | amulet | Supports on your auto attack also apply to Heralds |
| **Living Ember** | gloves | Ignite counts as chill for reactions |
| **Ironroot Plate** | body | Armour also reduces elemental hits at half value |
| **Wanderer's Compass** | boots | Projectiles home, but lose 20% speed |
| **Recursion Engine** | ring | Divide may recurse one extra generation |
| **Hollow Crown** | helmet | Each Herald kill grants +1 temporary projectile (stacks to 5) |
| **Stormglass Bow** | bow | Arrows that chain also fork |

---

## 6. Evolutions (VS-style secret combos)

A max-level skill gem + a specific legendary/passive turns into an evolved
skill, which is discovered by playing.

| Skill | + Requires | → Evolved |
|---|---|---|
| Knife Fan | +projectile-speed legendary | **Endless Edge**: knives never stop firing |
| Miasma Aura | Life Leech mastery | **Soul Eater**: aura heals per enemy |
| Hammer Orbit | +duration legendary | **Unending Orbit**: permanent, double hammers |
| Frost Bolt | Glacier Heart | **Glacial Lance**: bolts freeze and shatter in chains |
| Living Bomb | Spreading Flame mastery | **Wildfire**: explosions plant new bombs |
| Arc | Stormglass Bow | **Thunderweb**: chains link targets with lasting beams |
| Bonebreaker | Fortify mastery | **Earthbreaker**: each stun cracks the ground |

---

## 7. Engine building blocks needed

Which pieces each skill needs, and roughly when we build them. The first
engine wave should cover enough to make most of the catalog possible.

| Building block | Needed for | Wave |
|---|---|---|
| projectile, melee, area, triggers (hit/kill/expire), stat mods, limits | most skills, Volley/Shatter/Chain/Fork/Pierce | **1** |
| status effects: chill, freeze, ignite, shock, poison, bleed | elements, reactions, Ice Lance | **1** |
| zone (ground), orbit, return, homing, wall-bounce | Lingering, Hammer Orbit, Ricochet Blade, Bouncing Rune | **2** |
| channel, cast time, charges/stacks, cooldowns | Bladestorm, Blizzard, Fuse Arrow, Pyroblast | **2** |
| movement skills (dash, leap, teleport) | Vaulting Crash, Flame Dash, Blink Strike | **2** |
| chain, beam | Arc, Flamethrower, Freezing Clock | **2** |
| buffs, auras, curses, heralds (reserve mana) | Battle Roar, Hex, Heralds, Haste | **3** |
| summons: minions, totems, traps, mines, familiars | Raise Skeletons, Ballista, Blade Trap | **3** |
| corpses, pull, wall-pierce, sigils/brands | Corpse Burst, Void Sphere, Drill Bolt, Storm Sigil | **4** |
| element queue | Elemental Weave | **4** |

### Suggested first playable set (engine wave 1)

| Auto attacks | Skills | Supports |
|---|---|---|
| Slash (sword), Shoot (bow), Spark Bolt (wand) | Frost Bolt, Fireball, Earthsplitter, Fanning Shot, Ice Nova, Magma Strike | Volley, Pierce, Chain, Fork, Shatter, Echo, Cast on Kill, Added Cold, Concentrated, Knockback |

That's enough to try dozens of combos, including Frost Bolt + Volley + Shatter
and things like Magma Strike + Volley + Chain or a Fork + Shatter auto
attack. It exercises every wave-1 building block.
