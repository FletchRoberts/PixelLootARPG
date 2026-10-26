// Zone simulation: one player, sleeping monster packs along a generated linear zone,
// stat-driven combat (docs/combat.md), skills + supports (docs/skills.md), weapon attack,
// dodge roll, XP and levels, gem drops and pickup, and an exit at the end.
// Pure and headless: state is plain data, advanced by step() with fixed dt.

import { applyHit, expectedHit, rollHit, ELEMENTS, type CombatRules, type DamageRange, type Defences, type HitSummary } from "./combat/damage";
import { clone } from "./core/clone";
import { Rng } from "./core/rng";
import { add, angleOf, dist, len, normalize, scale, sub, type Vec } from "./core/vec";
import type {
  AttributeBonuses,
  Biome,
  Character,
  Affix,
  CombatRulesDef,
  DropTable,
  GearRules,
  GemRules,
  ItemBase,
  Monster,
  MonsterScaling,
  Progression,
  WeaponDef,
  UniqueDef,
  ZoneGenConfig,
} from "./data/types";
import { weaponAttackSkill, compileSkill } from "./skills/compile";
import { stepProjectiles, useSkill, type ProjectileState, type SkillContext } from "./skills/runtime";
import type { CompiledNode, CompiledSkill, Loadout, SkillDef, SupportDef } from "./skills/types";
import { rollDrops } from "./items/drops";
import { makeGem } from "./items/gems";
import { equipmentGrants, equipmentModifiers, rollGear, type RollOptions } from "./items/gear";
import { addToBag, equipGear, equipSkill, levelSkillGem, socketSupport, unequipGear, unequipSkill, unsocket } from "./items/inventory";
import { applyDeathPenalty, loadoutOf, newCharacter } from "./items/save";
import type { CharacterSave, EquipSlot, GemItem, GroundItem, Item, SocketTarget } from "./items/types";
import { gainXp, monsterScale, playerModifiers, playerStats, xpForKill } from "./stats/character";
import { computeStat, type StatBlock } from "./stats/stats";
import { buildFlowField, distAt, nextStep, UNREACHED, type FlowField } from "./zone/flowfield";
import { generateZone } from "./zone/generate";
import { hasLineOfSight, isFloorAt, resolveWalls, tileCenter, tileOf, type Zone } from "./zone/zone";

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
export const SKILL_SLOTS = 4;

const KNOCKBACK_DECAY = 10; // per second, exponential
const SEPARATION_STRENGTH = 0.5;
const FLOW_MAX_DIST = 40; // tiles; monsters further than this can't path to the player
const EXIT_RADIUS = 0.8; // tiles
const TRIGGER_TARGET_RANGE = 600; // px: Cast on Kill aims at enemies this close to the corpse

export interface SimContent {
  characters: Character[];
  monsters: Monster[];
  weapons: WeaponDef[];
  skills: SkillDef[];
  supports: SupportDef[];
  zoneGen: ZoneGenConfig;
  biomes: Biome[];
  progression: Progression;
  attributes: AttributeBonuses;
  monsterScaling: MonsterScaling;
  combat: CombatRulesDef;
  dropTables: DropTable[];
  gems: GemRules;
  itemBases: ItemBase[];
  affixes: Affix[];
  uniques: UniqueDef[];
  gear: GearRules;
}

export interface Actor {
  id: number;
  defId: string; // character or monster id
  pos: Vec;
  knock: Vec; // knockback velocity, decays
  radius: number;
  life: number;
  maxLife: number;
  facing: number; // radians
  evasionEntropy: number; // docs/combat.md §4.1
}

export interface PlayerState extends Actor {
  level: number;
  xp: number;
  mana: number;
  maxMana: number;
  stats: StatBlock; // global (untagged) stats, recomputed when level/gear changes
  save: CharacterSave; // equipped gems, bag, weapon (level/xp live on the player and are written back)
  loadout: Loadout; // derived from the save's gems (or a debug/test override)
  loadoutOverride: Loadout | null;
  speed: number; // px/s after movement speed modifiers
  compiled: (CompiledSkill | null)[]; // [0] = weapon attack, [1..SKILL_SLOTS] = skill slots
  castLock: number; // seconds until the player can attack/cast again
  roll: { t: number; dir: Vec } | null; // active dodge roll
  rollCooldown: number;
  pending: { t: number; skill: number; angle: number; left: number }[]; // Echo repeats waiting to fire
  triggerCooldowns: number[]; // per compiled skill, for Cast on Kill
  leech: { life: number; mana: number }; // queued recovery from leech, paid out at a capped rate
}

export interface Ailments {
  chill: number; // seconds left
  slow: number; // percent
  freeze: number; // seconds left
  ignite: number; // seconds left
  igniteDps: number; // fire damage per second before resistance
}

export const NO_AILMENTS: Ailments = { chill: 0, slow: 0, freeze: 0, ignite: 0, igniteDps: 0 };

export interface MonsterState extends Actor {
  contactCooldown: number;
  packId: number;
  awake: boolean;
  level: number;
  ailments: Ailments;
  dropTable: string;
}

export interface WorldState {
  tick: number;
  rngState: number;
  zone: Zone;
  monsterLevel: number;
  zonesCleared: number; // before this zone
  status: "playing" | "dead" | "complete";
  player: PlayerState;
  monsters: MonsterState[];
  projectiles: ProjectileState[];
  groundItems: GroundItem[];
  nextId: number;
  kills: number;
  totalMonsters: number;
}

/**
 * Player intent for one tick. `aim` is a world-space point (the client applies aim assist).
 * `attack` = weapon attack held, toward aim;
 * `skills[i]` = skill slot i held; `dodge` = dodge pressed this tick; `pickup` = pick up the nearest item.
 */
export interface PlayerInput {
  move: Vec;
  aim: Vec;
  attack: boolean;
  skills?: boolean[];
  dodge?: boolean;
  pickup?: boolean;
}

export type SimEvent =
  | { type: "swing"; actorId: number; angle: number; arc: number; range: number }
  | { type: "area"; pos: Vec; radius: number; angle: number; arc: number; element: "physical" | "fire" | "cold" | "lightning" | "chaos" }
  | { type: "cast"; slot: number; skill: string }
  | { type: "no_mana"; slot: number }
  | { type: "dodge" }
  | { type: "damage"; targetId: number; amount: number; crit: boolean; pos: Vec }
  | { type: "evade"; targetId: number; pos: Vec }
  | { type: "death"; actorId: number; pos: Vec }
  | { type: "xp"; amount: number }
  | { type: "level_up"; level: number }
  | { type: "drop"; itemId: number }
  | { type: "pickup"; item: Item }
  | { type: "bag_full" }
  | { type: "wake"; packId: number }
  | { type: "player_died" }
  | { type: "zone_complete" };

// Derived, non-serialized cache: flow field toward the player's current tile.
const flowCache = new WeakMap<WorldState, FlowField>();

function lookup<T extends { id: string }>(list: T[], id: string, what: string): T {
  const found = list.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown ${what} id "${id}"`);
  return found;
}

export function createWorld(content: SimContent, seed: number, save: CharacterSave = newCharacter(content, seed)): WorldState {
  const zone = generateZone(content.zoneGen, seed);
  const hero = lookup(content.characters, save.characterId, "character");
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const own: CharacterSave = clone(save); // the world mutates its own copy
  const world: WorldState = {
    tick: 0,
    rngState: 0,
    zone,
    monsterLevel: 1 + own.zonesCleared,
    zonesCleared: own.zonesCleared,
    status: "playing",
    player: {
      id: 1,
      defId: hero.id,
      pos: { ...zone.start },
      knock: { x: 0, y: 0 },
      radius: hero.radius,
      life: 0,
      maxLife: 0,
      facing: 0,
      evasionEntropy: rng.next(),
      level: own.level,
      xp: own.xp,
      mana: 0,
      maxMana: 0,
      stats: {},
      save: own,
      loadout: loadoutOf(own),
      loadoutOverride: null,
      speed: hero.speed,
      compiled: [],
      castLock: 0,
      roll: null,
      rollCooldown: 0,
      pending: [],
      triggerCooldowns: [],
      leech: { life: 0, mana: 0 },
    },
    monsters: [],
    projectiles: [],
    groundItems: [],
    nextId: 2,
    kills: 0,
    totalMonsters: 0,
  };
  recomputePlayer(world, content);
  world.player.life = world.player.maxLife;
  world.player.mana = world.player.maxMana;
  zone.packs.forEach((pack, packId) => {
    const table = pack.kind === "end" ? content.zoneGen.endPackDropTable : undefined;
    for (let i = 0; i < pack.size; i++) spawnMonster(world, content, rng, pack.pos, content.zoneGen.packs.spread, packId, table);
  });
  world.totalMonsters = world.monsters.length;
  world.rngState = rng.state;
  return world;
}

/** The character as it stands right now (level, XP, gems, bag). A deep copy. */
export function currentSave(world: WorldState): CharacterSave {
  const p = world.player;
  return clone({ ...p.save, level: p.level, xp: p.xp, zonesCleared: world.zonesCleared });
}

/** Character to carry into the next zone after clearing this one. */
export function saveAfterClear(world: WorldState): CharacterSave {
  return { ...currentSave(world), zonesCleared: world.zonesCleared + 1 };
}

/** Character after dying: keeps everything picked up, loses some XP (never a level). */
export function saveAfterDeath(world: WorldState, content: SimContent): CharacterSave {
  const save = currentSave(world);
  applyDeathPenalty(save, content.progression);
  return save;
}

/** Debug/test helper: run with this loadout instead of the equipped gems. */
export function setLoadout(world: WorldState, content: SimContent, loadout: Loadout): void {
  world.player.loadoutOverride = loadout;
  world.player.save.weapon = loadout.weapon;
  refreshSkills(world, content);
}

export type InventoryCommand =
  | { type: "equip"; bagIndex: number; slot: number }
  | { type: "unequip"; slot: number }
  | { type: "level_gem"; slot: number; copyBagIndex: number }
  | { type: "socket"; bagIndex: number; target: SocketTarget; socket: number }
  | { type: "unsocket"; target: SocketTarget; socket: number }
  | { type: "equip_gear"; bagIndex: number; slot?: EquipSlot }
  | { type: "unequip_gear"; slot: EquipSlot }
  | { type: "debug_give"; kind: GemItem["kind"]; defId: string }
  | { type: "debug_give_gear"; opts: RollOptions; seed: number };

/** Change equipped gems. Returns null on success or why it was refused. */
export function inventoryCommand(world: WorldState, content: SimContent, cmd: InventoryCommand): string | null {
  const save = world.player.save;
  let result: string | null;
  switch (cmd.type) {
    case "equip":
      result = equipSkill(save, cmd.bagIndex, cmd.slot, content);
      break;
    case "unequip":
      result = unequipSkill(save, cmd.slot, content);
      break;
    case "level_gem":
      result = levelSkillGem(save, cmd.slot, cmd.copyBagIndex, content);
      break;
    case "socket":
      result = socketSupport(save, cmd.bagIndex, cmd.target, cmd.socket, content);
      break;
    case "unsocket":
      result = unsocket(save, cmd.target, cmd.socket, content);
      break;
    case "debug_give":
      result = addToBag(save, makeGem(save, cmd.kind, cmd.defId, content.gems), content) ? null : "bag is full";
      break;
    case "equip_gear": {
      const s = world.player.stats;
      result = equipGear(save, cmd.bagIndex, cmd.slot, { level: world.player.level, strength: s.strength ?? 0, dexterity: s.dexterity ?? 0, intelligence: s.intelligence ?? 0 }, content);
      break;
    }
    case "unequip_gear":
      result = unequipGear(save, cmd.slot, content);
      break;
    case "debug_give_gear": {
      const item = rollGear(content, new Rng(cmd.seed), world.monsterLevel, save.nextUid, cmd.opts);
      if (item) save.nextUid++;
      result = !item ? "nothing fits" : addToBag(save, item, content) ? null : "bag is full";
      break;
    }
  }
  if (result === null) refreshSkills(world, content);
  return result;
}

/** The world as it would be after a command, without touching the real one (for UI previews). */
export function previewInventoryCommand(world: WorldState, content: SimContent, cmd: InventoryCommand): WorldState | string {
  const copy = clone(world);
  return inventoryCommand(copy, content, cmd) ?? copy;
}

/** Recompile after the equipped gems change; drops in-flight projectiles (compiled indices shift). */
function refreshSkills(world: WorldState, content: SimContent): void {
  world.projectiles = [];
  world.player.pending = [];
  recomputePlayer(world, content);
}

/** Refresh stats and compiled skills (after level up or loadout change). Keeps missing life/mana. */
export function recomputePlayer(world: WorldState, content: SimContent): void {
  const p = world.player;
  const hero = lookup(content.characters, p.defId, "character");
  const gearMods = equipmentModifiers(content, p.save.equipment);
  const stats = playerStats(hero, p.level, content, gearMods);
  const lifeGain = (stats.life ?? 0) - p.maxLife;
  const manaGain = (stats.mana ?? 0) - p.maxMana;
  p.stats = stats;
  p.maxLife = stats.life ?? 1;
  p.maxMana = stats.mana ?? 0;
  p.life = Math.min(p.maxLife, p.life + Math.max(0, lifeGain));
  p.mana = Math.min(p.maxMana, p.mana + Math.max(0, manaGain));

  p.loadout = p.loadoutOverride ?? loadoutOf(p.save);
  const mods = playerModifiers(hero, p.level, content, gearMods);
  p.speed = computeStat("movement_speed", hero.speed, mods);
  const weapon = lookup(content.weapons, p.loadout.weapon, "weapon");
  // Socketed supports plus supports granted by uniques (for skills with the grant's tags).
  const grants = equipmentGrants(content, p.save.equipment);
  const supportsOf = (ids: string[], skillTags: string[]) => {
    const granted = grants.filter((g) => g.tags.every((t) => skillTags.includes(t))).map((g) => g.support);
    return [...new Set([...ids, ...granted])].filter((id) => content.supports.some((s) => s.id === id)).map((id) => lookup(content.supports, id, "support"));
  };
  const gemLevelMods = (level = 1) => (level > 1 ? [{ stat: "damage", kind: "increased" as const, value: (level - 1) * content.gems.damagePerLevel, source: "gem level" }] : []);
  p.compiled = [
    compileSkill({ skill: weaponAttackSkill(weapon), supports: supportsOf(p.loadout.attackSupports, weapon.attack.tags), playerMods: mods, weapon }),
    ...Array.from({ length: SKILL_SLOTS }, (_, i) => {
      const slot = p.loadout.slots[i];
      const def = slot?.skill ? content.skills.find((k) => k.id === slot.skill) : undefined;
      return def ? compileSkill({ skill: def, supports: supportsOf(slot!.supports, def.tags), playerMods: mods, weapon, extraMods: gemLevelMods(slot!.level) }) : null;
    }),
  ];
}

/** Advance the world by one fixed tick. Mutates `world`, returns events for the client. */
export function step(world: WorldState, content: SimContent, input: PlayerInput, dt = DT): SimEvent[] {
  const events: SimEvent[] = [];
  if (world.status !== "playing") return events;

  const rng = new Rng(world.rngState);
  const ctx = combatContext(world, content, rng);
  updatePlayer(world, content, input, ctx, events, dt);
  stepProjectiles(world, ctx, events, dt);
  reapDead(world, content, ctx, rng, events);
  updateMonsters(world, content, rng, events, dt);
  if (world.status === "playing" && dist(world.player.pos, world.zone.exit) < EXIT_RADIUS * world.zone.tileSize) {
    world.status = "complete";
    events.push({ type: "zone_complete" });
  }

  world.tick++;
  world.rngState = rng.state;
  return events;
}

/** Flow field toward the player, rebuilt only when the player changes tile. */
export function playerFlowField(world: WorldState): FlowField {
  const { tx, ty } = tileOf(world.zone, world.player.pos);
  let field = flowCache.get(world);
  if (!field || field.tx !== tx || field.ty !== ty) {
    field = buildFlowField(world.zone, tx, ty, FLOW_MAX_DIST);
    flowCache.set(world, field);
  }
  return field;
}

export function playerDefences(p: PlayerState): Defences {
  const resist: Defences["resist"] = {};
  for (const e of ELEMENTS) resist[e] = p.stats[`${e}_resistance`] ?? 0;
  return { armour: p.stats.armour ?? 0, evasion: p.stats.evasion ?? 0, resist };
}

function monsterDefences(m: MonsterState, def: Monster, content: SimContent): Defences {
  const s = content.monsterScaling;
  return {
    armour: def.armour * monsterScale("armour", m.level, s),
    evasion: def.evasion * monsterScale("evasion", m.level, s),
    resist: { ...def.resist },
  };
}

function scaleRange(range: DamageRange, mult: number): DamageRange {
  const out: DamageRange = {};
  for (const [type, r] of Object.entries(range) as [keyof DamageRange, [number, number]][]) out[type] = [r[0] * mult, r[1] * mult];
  return out;
}

/** How skills deal damage to monsters: the docs/combat.md pipeline. */
function combatContext(world: WorldState, content: SimContent, rng: Rng): SkillContext {
  const rules = content.combat as CombatRules;
  return {
    hit(m: MonsterState, skill: CompiledSkill, node: CompiledNode, dir: Vec, events: SimEvent[]): boolean {
      if (m.life <= 0) return false;
      if (!m.awake) wakePack(world, m.packId, events);
      const def = lookup(content.monsters, m.defId, "monster");
      const hit = rollHit(
        {
          base: node.base,
          tags: node.tags,
          critChance: skill.critChance,
          accuracy: world.player.stats.accuracy ?? 0,
          isAttack: skill.isAttack,
          damageEffectiveness: node.effectiveness,
        },
        node.mods,
        rules,
        rng,
      );
      const entropy = { value: m.evasionEntropy };
      const result = applyHit(hit, monsterDefences(m, def, content), rules, entropy);
      m.evasionEntropy = entropy.value;
      if (result.evaded) {
        events.push({ type: "evade", targetId: m.id, pos: { ...m.pos } });
        return false;
      }
      m.life -= result.total;
      // Leech: a share of the damage dealt queues up as life/mana recovery (paid out over time).
      const p = world.player;
      p.leech.life += (result.total * computeStat("life_leech", 0, node.mods, node.tags)) / 100;
      p.leech.mana += (result.total * computeStat("mana_leech", 0, node.mods, node.tags)) / 100;
      m.knock = add(m.knock, scale(dir, node.knockback));
      events.push({ type: "damage", targetId: m.id, amount: result.total, crit: hit.crit, pos: { ...m.pos } });
      applyAilments(m, result.byType, node, rules, rng);
      return m.life <= 0;
    },
  };
}

export interface SkillSummary extends HitSummary {
  name: string;
  usesPerSecond: number;
  dps: number; // root delivery only, vs no defences
  cost: number;
}

/**
 * Chill and freeze from cold damage, ignite from fire damage (docs/combat.md ailments).
 * Freeze needs a cold hit worth at least `threshold` % of the target's max life.
 */
function applyAilments(m: MonsterState, dealt: Partial<Record<string, number>>, node: CompiledNode, rules: CombatRules, rng: Rng): void {
  const a = rules.ailments;
  const cold = dealt.cold ?? 0;
  if (cold > 0) {
    m.ailments.chill = Math.max(m.ailments.chill, a.chill.duration);
    m.ailments.slow = Math.max(m.ailments.slow, a.chill.slow);
    const percent = (cold / m.maxLife) * 100;
    if (percent >= a.freeze.threshold) {
      const seconds = Math.min(a.freeze.max, Math.max(a.freeze.min, percent * a.freeze.secondsPerPercent));
      m.ailments.freeze = Math.max(m.ailments.freeze, seconds);
    }
  }
  const fire = dealt.fire ?? 0;
  if (fire > 0 && node.igniteChance > 0 && rng.next() * 100 < node.igniteChance * node.procCoefficient) {
    // Stronger ignite replaces a weaker one; the duration refreshes.
    m.ailments.igniteDps = Math.max(m.ailments.ignite > 0 ? m.ailments.igniteDps : 0, (fire * a.ignite.dpsPercentOfHit) / 100);
    m.ailments.ignite = a.ignite.duration;
  }
}

/** Sheet/tooltip numbers for a compiled skill's root delivery. */
export function skillSummary(world: WorldState, content: SimContent, index: number): SkillSummary | null {
  const skill = world.player.compiled[index];
  if (!skill) return null;
  const node = skill.nodes[0]!;
  const hit = expectedHit(
    { base: node.base, tags: node.tags, critChance: skill.critChance, accuracy: 0, isAttack: skill.isAttack, damageEffectiveness: node.effectiveness },
    node.mods,
    content.combat as CombatRules,
  );
  const usesPerSecond = 1 / skill.interval;
  return { ...hit, name: skill.name, usesPerSecond, dps: hit.averageWithCrit * node.count * usesPerSecond, cost: skill.cost };
}

function updatePlayer(world: WorldState, content: SimContent, input: PlayerInput, ctx: SkillContext, events: SimEvent[], dt: number): void {
  const p = world.player;
  const hero = lookup(content.characters, p.defId, "character");
  p.mana = Math.min(p.maxMana, p.mana + (p.stats.mana_regen ?? 0) * dt);
  payOutLeech(p, content.combat as CombatRules, dt);
  p.castLock = Math.max(0, p.castLock - dt);
  p.rollCooldown = Math.max(0, p.rollCooldown - dt);
  p.triggerCooldowns = p.triggerCooldowns.map((t) => Math.max(0, t - dt));

  // Echo: queued repeats fire from wherever the player is now, in the original direction.
  for (const r of p.pending) r.t -= dt;
  for (const r of p.pending.filter((r) => r.t <= 0)) {
    useSkill(world, r.skill, p.pos, r.angle, ctx, events);
    const repeat = p.compiled[r.skill]?.repeat;
    if (r.left > 1 && repeat) p.pending.push({ t: repeat.delay, skill: r.skill, angle: r.angle, left: r.left - 1 });
  }
  p.pending = p.pending.filter((r) => r.t > 0);

  // Dodge roll: fixed-speed dash in the move direction (or facing), cancels casting.
  const move = len(input.move) > 1 ? normalize(input.move) : input.move;
  if (input.dodge && !p.roll && p.rollCooldown === 0) {
    const dir = len(move) > 0.1 ? normalize(move) : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
    p.roll = { t: 0, dir };
    p.castLock = 0;
    events.push({ type: "dodge" });
  }
  if (p.roll) {
    const d = hero.dodge;
    p.pos = add(p.pos, scale(p.roll.dir, (d.distance / d.duration) * dt));
    p.roll.t += dt;
    if (p.roll.t >= d.duration) {
      p.roll = null;
      p.rollCooldown = d.cooldown;
    }
  } else {
    p.pos = add(p.pos, scale(move, p.speed * dt));
  }
  applyKnockback(p, dt);
  p.pos = resolveWalls(world.zone, p.pos, p.radius);
  if (input.pickup) pickUpNearest(world, content, events);
  if (p.roll) return;

  const aimAngle = dist(input.aim, p.pos) > 1 ? angleOf(sub(input.aim, p.pos)) : p.facing;

  // Skill slots take priority over the weapon attack.
  if (p.castLock === 0) {
    for (let i = 0; i < SKILL_SLOTS; i++) {
      if (!input.skills?.[i]) continue;
      const skill = p.compiled[i + 1];
      if (!skill || skill.trigger) continue; // triggered skills fire themselves
      if (p.mana < skill.cost) {
        events.push({ type: "no_mana", slot: i });
        continue;
      }
      p.mana -= skill.cost;
      p.facing = aimAngle;
      p.castLock = skill.interval;
      events.push({ type: "cast", slot: i, skill: skill.id });
      castWithRepeats(world, i + 1, aimAngle, ctx, events);
      return;
    }
  }

  // Weapon attack while held, toward the aim point; otherwise just face where the player aims.
  if (dist(input.aim, p.pos) > 1) p.facing = aimAngle;
  if (!input.attack || p.castLock > 0) return;
  const weaponAttack = p.compiled[0]!;
  p.castLock = weaponAttack.interval;
  castWithRepeats(world, 0, aimAngle, ctx, events);
}

function castWithRepeats(world: WorldState, index: number, angle: number, ctx: SkillContext, events: SimEvent[]): void {
  const p = world.player;
  useSkill(world, index, p.pos, angle, ctx, events);
  const repeat = p.compiled[index]?.repeat;
  if (repeat) p.pending.push({ t: repeat.delay, skill: index, angle, left: repeat.count });
}

/**
 * Leech recovers at most `leech.maxRate`% of max life/mana per second (PoE-style), so big hits
 * fill a pool that drains over time instead of healing instantly. Excess beyond full is lost.
 */
function payOutLeech(p: PlayerState, rules: CombatRules, dt: number): void {
  const rate = rules.leech.maxRate / 100;
  const life = Math.min(p.leech.life, p.maxLife * rate * dt);
  p.leech.life -= life;
  p.life = Math.min(p.maxLife, p.life + life);
  const mana = Math.min(p.leech.mana, p.maxMana * rate * dt);
  p.leech.mana -= mana;
  p.mana = Math.min(p.maxMana, p.mana + mana);
  if (p.life >= p.maxLife) p.leech.life = 0;
  if (p.mana >= p.maxMana) p.leech.mana = 0;
}

/** Nearest living monster within range of a point, with line of sight. */
function nearestVisibleMonster(world: WorldState, from: Vec, range: number): MonsterState | null {
  let best: MonsterState | null = null;
  let bestD = range;
  for (const m of world.monsters) {
    if (m.life <= 0) continue;
    const d = dist(m.pos, from);
    if (d < bestD && hasLineOfSight(world.zone, from, m.pos)) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

/** The ground item the player would pick up right now, if any. */
export function nearestPickup(world: WorldState, content: SimContent): GroundItem | null {
  let best: GroundItem | null = null;
  let bestD = content.gems.pickupRange;
  for (const g of world.groundItems) {
    const d = dist(g.pos, world.player.pos);
    if (d <= bestD) {
      best = g;
      bestD = d;
    }
  }
  return best;
}

function pickUpNearest(world: WorldState, content: SimContent, events: SimEvent[]): void {
  const g = nearestPickup(world, content);
  if (!g) return;
  if (!addToBag(world.player.save, g.item, content)) {
    events.push({ type: "bag_full" });
    return;
  }
  world.groundItems = world.groundItems.filter((x) => x !== g);
  events.push({ type: "pickup", item: clone(g.item) });
}

/** Remove dead monsters, award XP (character and equipped gems), drop loot, and fire Cast on Kill skills. */
function reapDead(world: WorldState, content: SimContent, ctx: SkillContext, rng: Rng, events: SimEvent[]): void {
  const dead = world.monsters.filter((m) => m.life <= 0);
  if (dead.length === 0) return;
  const p = world.player;
  world.monsters = world.monsters.filter((m) => m.life > 0);
  world.kills += dead.length;
  let xp = 0;
  for (const m of dead) {
    events.push({ type: "death", actorId: m.id, pos: { ...m.pos } });
    const def = lookup(content.monsters, m.defId, "monster");
    xp += xpForKill(def.xp, m.level, p.level, content.progression, content.monsterScaling);
    for (const drop of rollDrops(content, m.dropTable, rng)) {
      // Gear rolls at the monster's level (item level gates affix tiers and bases).
      const item: Item | null =
        drop.kind === "gear" || drop.kind === "unique"
          ? rollGear(content, rng, m.level, p.save.nextUid++, drop.kind === "unique" ? (drop.unique ? { unique: drop.unique } : { rarity: "unique" }) : { base: drop.base })
          : makeGem(p.save, drop.kind, drop.defId, content.gems);
      if (!item) continue;
      const spread = 24;
      const pos = resolveWalls(world.zone, { x: m.pos.x + rng.range(-spread, spread), y: m.pos.y + rng.range(-spread, spread) }, 8);
      const id = world.nextId++;
      world.groundItems.push({ id, item, pos });
      events.push({ type: "drop", itemId: id });
    }
  }
  events.push({ type: "xp", amount: xp });
  if (gainXp(p, xp, content.progression) > 0) {
    recomputePlayer(world, content);
    events.push({ type: "level_up", level: p.level });
  }

  // Cast on Kill: after removal, so anything the triggered skill kills is reaped (with XP) next tick.
  p.compiled.forEach((skill, index) => {
    if (skill?.trigger?.on !== "kill" || (p.triggerCooldowns[index] ?? 0) > 0) return;
    const at = dead[0]!.pos;
    p.triggerCooldowns[index] = skill.trigger.cooldown;
    events.push({ type: "cast", slot: index - 1, skill: skill.id });
    // Smart-target the root delivery at the next enemy; its children keep their own patterns.
    const next = nearestVisibleMonster(world, at, TRIGGER_TARGET_RANGE);
    const angle = next ? angleOf(sub(next.pos, at)) : angleOf(sub(at, p.pos));
    useSkill(world, index, { ...at }, angle, ctx, events);
  });
}

function updateMonsters(world: WorldState, content: SimContent, rng: Rng, events: SimEvent[], dt: number): void {
  const p = world.player;
  const zone = world.zone;
  const field = playerFlowField(world);
  const rules = content.combat as CombatRules;
  const hero = lookup(content.characters, p.defId, "character");
  const untouchable = p.roll !== null && hero.dodge.invulnerable;

  for (const m of world.monsters) {
    if (m.life <= 0) continue;
    const def = lookup(content.monsters, m.defId, "monster");
    const { tx, ty } = tileOf(zone, m.pos);
    const pathDist = distAt(field, zone, tx, ty);

    // Ailments tick down; ignite burns through fire resistance (no armour, no evasion).
    const ail = m.ailments;
    if (ail.ignite > 0) {
      const resist = Math.min(rules.resistance.defaultMax, def.resist?.fire ?? 0);
      m.life -= ail.igniteDps * dt * (1 - resist / 100);
      ail.ignite = Math.max(0, ail.ignite - dt);
      if (m.life <= 0) continue; // reaped next tick
    }
    ail.chill = Math.max(0, ail.chill - dt);
    if (ail.chill === 0) ail.slow = 0;
    ail.freeze = Math.max(0, ail.freeze - dt);
    const frozen = ail.freeze > 0;
    const speed = frozen ? 0 : def.speed * (1 - ail.slow / 100);

    if (!m.awake) {
      if (pathDist <= def.aggroRange) wakePack(world, m.packId, events);
      else continue;
    }

    const toP = sub(p.pos, m.pos);
    m.facing = angleOf(toP);

    // Close by: head straight for the player. Further: walk downhill on the flow field.
    let target: Vec | null = null;
    if (pathDist <= 1) target = p.pos;
    else if (pathDist !== UNREACHED) {
      const next = nextStep(field, zone, tx, ty);
      if (next) target = tileCenter(zone, next.tx, next.ty);
    }
    if (target) {
      const toT = sub(target, m.pos);
      const gap = target === p.pos ? len(toT) - (p.radius + m.radius) : len(toT);
      if (gap > 0) m.pos = add(m.pos, scale(normalize(toT), Math.min(speed * dt, gap)));
    }

    // Separation from other awake monsters so packs spread instead of stacking.
    for (const o of world.monsters) {
      if (o === m || !o.awake) continue;
      const overlap = m.radius + o.radius - dist(m.pos, o.pos);
      if (overlap > 0) m.pos = add(m.pos, scale(normalize(sub(m.pos, o.pos)), overlap * SEPARATION_STRENGTH));
    }

    applyKnockback(m, dt);
    m.pos = resolveWalls(zone, m.pos, m.radius);

    if (frozen) continue; // frozen monsters can't attack
    m.contactCooldown = Math.max(0, m.contactCooldown - dt);
    if (untouchable || m.contactCooldown > 0 || dist(m.pos, p.pos) > p.radius + m.radius + 2) continue;

    m.contactCooldown = def.contactCooldown;
    const s = content.monsterScaling;
    const hit = rollHit(
      {
        base: scaleRange(def.damage, monsterScale("damage", m.level, s)),
        tags: ["attack", "melee"],
        critChance: 0,
        accuracy: def.accuracy * monsterScale("accuracy", m.level, s),
        isAttack: true,
      },
      [],
      rules,
      rng,
    );
    const entropy = { value: p.evasionEntropy };
    const result = applyHit(hit, playerDefences(p), rules, entropy);
    p.evasionEntropy = entropy.value;
    if (result.evaded) {
      events.push({ type: "evade", targetId: p.id, pos: { ...p.pos } });
      continue;
    }
    p.life = Math.max(0, p.life - result.total);
    events.push({ type: "damage", targetId: p.id, amount: result.total, crit: hit.crit, pos: { ...p.pos } });
    if (p.life === 0) {
      world.status = "dead";
      events.push({ type: "player_died" });
      return;
    }
  }
}

function wakePack(world: WorldState, packId: number, events: SimEvent[]): void {
  let woke = false;
  for (const m of world.monsters) {
    if (m.packId === packId && !m.awake) {
      m.awake = true;
      woke = true;
    }
  }
  if (woke) events.push({ type: "wake", packId });
}

function spawnMonster(world: WorldState, content: SimContent, rng: Rng, center: Vec, spreadTiles: number, packId: number, dropTable?: string): void {
  const monsterId = rng.weighted(content.zoneGen.monsterPool)?.id;
  if (!monsterId) return;
  const def = lookup(content.monsters, monsterId, "monster");
  const ts = world.zone.tileSize;
  let pos = center;
  for (let i = 0; i < 8; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * spreadTiles * ts;
    const candidate = add(center, { x: Math.cos(a) * r, y: Math.sin(a) * r });
    if (isFloorAt(world.zone, candidate)) {
      pos = candidate;
      break;
    }
  }
  const level = world.monsterLevel;
  const life = def.life * monsterScale("life", level, content.monsterScaling);
  world.monsters.push({
    id: world.nextId++,
    defId: def.id,
    pos: resolveWalls(world.zone, pos, def.radius),
    knock: { x: 0, y: 0 },
    radius: def.radius,
    life,
    maxLife: life,
    facing: rng.range(0, Math.PI * 2),
    evasionEntropy: rng.next(),
    contactCooldown: def.contactCooldown / 2,
    packId,
    awake: false,
    level,
    ailments: { ...NO_AILMENTS },
    dropTable: dropTable ?? def.dropTable,
  });
}

function applyKnockback(a: Actor, dt: number): void {
  a.pos = add(a.pos, scale(a.knock, dt));
  a.knock = scale(a.knock, Math.exp(-KNOCKBACK_DECAY * dt));
}
