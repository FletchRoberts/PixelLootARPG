// Zone simulation: one player, sleeping monster packs along a generated linear zone,
// stat-driven combat (docs/combat.md), auto attack, XP and levels, and an exit at the end.
// Pure and headless: state is plain data, advanced by step() with fixed dt.

import { applyHit, expectedHit, rollHit, ELEMENTS, type CombatRules, type DamageRange, type Defences, type HitSummary } from "./combat/damage";
import { Rng } from "./core/rng";
import { add, angleOf, angleDiff, dist, len, normalize, scale, sub, type Vec } from "./core/vec";
import type {
  AttributeBonuses,
  Biome,
  Character,
  CombatRulesDef,
  Monster,
  MonsterScaling,
  Progression,
  WeaponDef,
  ZoneGenConfig,
} from "./data/types";
import { gainXp, monsterScale, playerModifiers, playerStats, xpForKill } from "./stats/character";
import { computeStat, type StatBlock } from "./stats/stats";
import { buildFlowField, distAt, nextStep, UNREACHED, type FlowField } from "./zone/flowfield";
import { generateZone } from "./zone/generate";
import { isFloorAt, resolveWalls, tileCenter, tileOf, type Zone } from "./zone/zone";

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

const KNOCKBACK_DECAY = 10; // per second, exponential
const SEPARATION_STRENGTH = 0.5;
const FLOW_MAX_DIST = 40; // tiles; monsters further than this can't path to the player
const EXIT_RADIUS = 0.8; // tiles

export interface SimContent {
  characters: Character[];
  monsters: Monster[];
  weapons: WeaponDef[];
  zoneGen: ZoneGenConfig;
  biomes: Biome[];
  progression: Progression;
  attributes: AttributeBonuses;
  monsterScaling: MonsterScaling;
  combat: CombatRulesDef;
}

/** What carries over between zones. */
export interface Progress {
  level: number;
  xp: number;
  zonesCleared: number;
}

export const NEW_PROGRESS: Progress = { level: 1, xp: 0, zonesCleared: 0 };

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
  attackCooldown: number;
  level: number;
  xp: number;
  mana: number;
  maxMana: number;
  weaponId: string;
  stats: StatBlock; // global (untagged) stats, recomputed when level/gear changes
}

export interface MonsterState extends Actor {
  contactCooldown: number;
  packId: number;
  awake: boolean;
  level: number;
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
  nextId: number;
  kills: number;
  totalMonsters: number;
}

/**
 * Player intent for one tick. `aim` is a world-space point; `attack` means attack is held
 * (manual, toward aim). With `autoAttack`, the weapon also swings at the nearest enemy in reach.
 */
export interface PlayerInput {
  move: Vec;
  aim: Vec;
  attack: boolean;
  autoAttack: boolean;
}

export type SimEvent =
  | { type: "swing"; actorId: number; angle: number; arc: number; range: number }
  | { type: "damage"; targetId: number; amount: number; crit: boolean; pos: Vec }
  | { type: "evade"; targetId: number; pos: Vec }
  | { type: "death"; actorId: number; pos: Vec }
  | { type: "xp"; amount: number }
  | { type: "level_up"; level: number }
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

export function createWorld(content: SimContent, seed: number, progress: Progress = NEW_PROGRESS, characterId = "hero"): WorldState {
  const zone = generateZone(content.zoneGen, seed);
  const hero = lookup(content.characters, characterId, "character");
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const world: WorldState = {
    tick: 0,
    rngState: 0,
    zone,
    monsterLevel: 1 + progress.zonesCleared,
    zonesCleared: progress.zonesCleared,
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
      attackCooldown: 0,
      level: progress.level,
      xp: progress.xp,
      mana: 0,
      maxMana: 0,
      weaponId: hero.startingWeapon,
      stats: {},
    },
    monsters: [],
    nextId: 2,
    kills: 0,
    totalMonsters: 0,
  };
  recomputePlayer(world, content);
  world.player.life = world.player.maxLife;
  world.player.mana = world.player.maxMana;
  zone.packs.forEach((pack, packId) => {
    for (let i = 0; i < pack.size; i++) spawnMonster(world, content, rng, pack.pos, content.zoneGen.packs.spread, packId);
  });
  world.totalMonsters = world.monsters.length;
  world.rngState = rng.state;
  return world;
}

/** Progress to carry into the next zone after this one is cleared. */
export function progressAfterClear(world: WorldState): Progress {
  return { level: world.player.level, xp: world.player.xp, zonesCleared: world.zonesCleared + 1 };
}

/** Refresh the player's stat snapshot (after level up, later gear/passive changes). Keeps missing life/mana. */
export function recomputePlayer(world: WorldState, content: SimContent): void {
  const p = world.player;
  const hero = lookup(content.characters, p.defId, "character");
  const stats = playerStats(hero, p.level, content);
  const lifeGain = (stats.life ?? 0) - p.maxLife;
  const manaGain = (stats.mana ?? 0) - p.maxMana;
  p.stats = stats;
  p.maxLife = stats.life ?? 1;
  p.maxMana = stats.mana ?? 0;
  p.life = Math.min(p.maxLife, p.life + Math.max(0, lifeGain));
  p.mana = Math.min(p.maxMana, p.mana + Math.max(0, manaGain));
}

/** Advance the world by one fixed tick. Mutates `world`, returns events for the client. */
export function step(world: WorldState, content: SimContent, input: PlayerInput, dt = DT): SimEvent[] {
  const events: SimEvent[] = [];
  if (world.status !== "playing") return events;

  const rng = new Rng(world.rngState);
  updatePlayer(world, content, input, rng, events, dt);
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

/** Seconds between auto/manual attacks with the current weapon and stats. */
export function attackInterval(world: WorldState, content: SimContent): number {
  const p = world.player;
  const hero = lookup(content.characters, p.defId, "character");
  const aa = lookup(content.weapons, p.weaponId, "weapon").autoAttack;
  const speed = computeStat("attack_speed", aa.attacksPerSecond, playerModifiers(hero, p.level, content), aa.tags);
  return 1 / speed;
}

export interface WeaponSummary extends HitSummary {
  name: string;
  attacksPerSecond: number;
  dps: number; // vs no defences
}

/** Character-sheet numbers for the equipped weapon's auto attack. */
export function weaponSummary(world: WorldState, content: SimContent): WeaponSummary {
  const p = world.player;
  const hero = lookup(content.characters, p.defId, "character");
  const weapon = lookup(content.weapons, p.weaponId, "weapon");
  const aa = weapon.autoAttack;
  const mods = playerModifiers(hero, p.level, content);
  const hit = expectedHit(
    { base: aa.damage, tags: aa.tags, critChance: aa.critChance, accuracy: p.stats.accuracy ?? 0, isAttack: true },
    mods,
    content.combat as CombatRules,
  );
  const attacksPerSecond = 1 / attackInterval(world, content);
  return { ...hit, name: weapon.name, attacksPerSecond, dps: hit.averageWithCrit * attacksPerSecond };
}

function updatePlayer(world: WorldState, content: SimContent, input: PlayerInput, rng: Rng, events: SimEvent[], dt: number): void {
  const p = world.player;
  const hero = lookup(content.characters, p.defId, "character");
  const aa = lookup(content.weapons, p.weaponId, "weapon").autoAttack;

  const move = len(input.move) > 1 ? normalize(input.move) : input.move;
  p.pos = add(p.pos, scale(move, hero.speed * dt));
  applyKnockback(p, dt);
  p.pos = resolveWalls(world.zone, p.pos, p.radius);
  p.mana = Math.min(p.maxMana, p.mana + (p.stats.mana_regen ?? 0) * dt);

  // Manual attack aims where the player points; auto attack picks the nearest enemy in reach.
  const reach = p.radius + aa.range;
  let swingAt: number | null = null;
  if (input.attack) {
    if (dist(input.aim, p.pos) > 1) p.facing = angleOf(sub(input.aim, p.pos));
    swingAt = p.facing;
  } else {
    const target = input.autoAttack ? nearestInReach(world, reach) : null;
    if (target) {
      p.facing = angleOf(sub(target.pos, p.pos));
      swingAt = p.facing;
    } else if (dist(input.aim, p.pos) > 1) {
      p.facing = angleOf(sub(input.aim, p.pos));
    }
  }

  p.attackCooldown = Math.max(0, p.attackCooldown - dt);
  if (swingAt === null || p.attackCooldown > 0) return;

  const mods = playerModifiers(hero, p.level, content);
  const rules = content.combat as CombatRules;
  const arc = (aa.arcDegrees * Math.PI) / 180;
  p.attackCooldown = attackInterval(world, content);
  events.push({ type: "swing", actorId: p.id, angle: swingAt, arc, range: reach });

  for (const m of world.monsters) {
    const toM = sub(m.pos, p.pos);
    if (len(toM) > reach + m.radius) continue;
    // Monsters overlapping the player are always hit; otherwise they must be inside the arc.
    if (len(toM) > p.radius + m.radius && Math.abs(angleDiff(angleOf(toM), swingAt)) > arc / 2) continue;
    if (!m.awake) wakePack(world, m.packId, events);

    const def = lookup(content.monsters, m.defId, "monster");
    const hit = rollHit(
      { base: aa.damage, tags: aa.tags, critChance: aa.critChance, accuracy: p.stats.accuracy ?? 0, isAttack: true },
      mods,
      rules,
      rng,
    );
    const entropy = { value: m.evasionEntropy };
    const result = applyHit(hit, monsterDefences(m, def, content), rules, entropy);
    m.evasionEntropy = entropy.value;
    if (result.evaded) {
      events.push({ type: "evade", targetId: m.id, pos: { ...m.pos } });
      continue;
    }
    m.life -= result.total;
    m.knock = add(m.knock, scale(normalize(toM), aa.knockback));
    events.push({ type: "damage", targetId: m.id, amount: result.total, crit: hit.crit, pos: { ...m.pos } });
  }

  const dead = world.monsters.filter((m) => m.life <= 0);
  if (dead.length === 0) return;
  world.monsters = world.monsters.filter((m) => m.life > 0);
  world.kills += dead.length;
  let xp = 0;
  for (const m of dead) {
    events.push({ type: "death", actorId: m.id, pos: { ...m.pos } });
    const def = lookup(content.monsters, m.defId, "monster");
    xp += xpForKill(def.xp, m.level, p.level, content.progression, content.monsterScaling);
  }
  events.push({ type: "xp", amount: xp });
  const gained = gainXp(p, xp, content.progression);
  if (gained > 0) {
    recomputePlayer(world, content);
    events.push({ type: "level_up", level: p.level });
  }
}

function nearestInReach(world: WorldState, reach: number): MonsterState | null {
  const p = world.player;
  let best: MonsterState | null = null;
  let bestD = Infinity;
  for (const m of world.monsters) {
    const d = dist(m.pos, p.pos) - m.radius;
    if (d <= reach && d < bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}

function updateMonsters(world: WorldState, content: SimContent, rng: Rng, events: SimEvent[], dt: number): void {
  const p = world.player;
  const zone = world.zone;
  const field = playerFlowField(world);
  const rules = content.combat as CombatRules;

  for (const m of world.monsters) {
    const def = lookup(content.monsters, m.defId, "monster");
    const { tx, ty } = tileOf(zone, m.pos);
    const pathDist = distAt(field, zone, tx, ty);

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
      if (gap > 0) m.pos = add(m.pos, scale(normalize(toT), Math.min(def.speed * dt, gap)));
    }

    // Separation from other awake monsters so packs spread instead of stacking.
    for (const o of world.monsters) {
      if (o === m || !o.awake) continue;
      const overlap = m.radius + o.radius - dist(m.pos, o.pos);
      if (overlap > 0) m.pos = add(m.pos, scale(normalize(sub(m.pos, o.pos)), overlap * SEPARATION_STRENGTH));
    }

    applyKnockback(m, dt);
    m.pos = resolveWalls(zone, m.pos, m.radius);

    m.contactCooldown = Math.max(0, m.contactCooldown - dt);
    if (m.contactCooldown > 0 || dist(m.pos, p.pos) > p.radius + m.radius + 2) continue;

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

function spawnMonster(world: WorldState, content: SimContent, rng: Rng, center: Vec, spreadTiles: number, packId: number): void {
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
  });
}

function applyKnockback(a: Actor, dt: number): void {
  a.pos = add(a.pos, scale(a.knock, dt));
  a.knock = scale(a.knock, Math.exp(-KNOCKBACK_DECAY * dt));
}
