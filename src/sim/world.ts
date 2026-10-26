// Test-room simulation: one player, chasing monsters, melee combat.
// Pure and headless: state is plain data, advanced by step() with fixed dt.

import { Rng } from "./core/rng";
import { add, angleOf, angleDiff, clamp, dist, len, normalize, scale, sub, type Vec } from "./core/vec";
import type { Character, Monster, TestRoom } from "./data/types";

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

const KNOCKBACK_DECAY = 10; // per second, exponential
const SEPARATION_STRENGTH = 0.5;

export interface SimContent {
  characters: Character[];
  monsters: Monster[];
  testRoom: TestRoom;
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
}

export interface PlayerState extends Actor {
  attackCooldown: number;
}

export interface MonsterState extends Actor {
  contactCooldown: number;
}

export interface WorldState {
  tick: number;
  rngState: number;
  room: { width: number; height: number };
  status: "playing" | "dead";
  player: PlayerState;
  monsters: MonsterState[];
  nextId: number;
  spawnTimer: number;
  kills: number;
}

/** Player intent for one tick. `aim` is a world-space point; `attack` means the button is held. */
export interface PlayerInput {
  move: Vec;
  aim: Vec;
  attack: boolean;
}

export type SimEvent =
  | { type: "swing"; actorId: number; angle: number; arc: number; range: number }
  | { type: "damage"; targetId: number; amount: number; pos: Vec }
  | { type: "death"; actorId: number; pos: Vec }
  | { type: "spawn"; actorId: number }
  | { type: "player_died" };

function lookup<T extends { id: string }>(list: T[], id: string, what: string): T {
  const found = list.find((e) => e.id === id);
  if (!found) throw new Error(`Unknown ${what} id "${id}"`);
  return found;
}

export function createWorld(content: SimContent, seed: number, characterId = "hero"): WorldState {
  const room = content.testRoom;
  const hero = lookup(content.characters, characterId, "character");
  const world: WorldState = {
    tick: 0,
    rngState: seed >>> 0,
    room: { width: room.width, height: room.height },
    status: "playing",
    player: {
      id: 1,
      defId: hero.id,
      pos: { x: room.width / 2, y: room.height / 2 },
      knock: { x: 0, y: 0 },
      radius: hero.radius,
      life: hero.life,
      maxLife: hero.life,
      facing: 0,
      attackCooldown: 0,
    },
    monsters: [],
    nextId: 2,
    spawnTimer: room.spawnInterval,
    kills: 0,
  };
  const rng = new Rng(world.rngState);
  for (let i = 0; i < room.initialMonsters; i++) spawnMonster(world, content, rng, []);
  world.rngState = rng.state;
  return world;
}

/** Advance the world by one fixed tick. Mutates `world`, returns events for the client. */
export function step(world: WorldState, content: SimContent, input: PlayerInput, dt = DT): SimEvent[] {
  const events: SimEvent[] = [];
  if (world.status !== "playing") return events;

  const rng = new Rng(world.rngState);
  const hero = lookup(content.characters, world.player.defId, "character");

  updatePlayer(world, hero, input, rng, events, dt);
  updateMonsters(world, content, events, dt);
  updateSpawns(world, content, rng, events, dt);

  world.tick++;
  world.rngState = rng.state;
  return events;
}

function updatePlayer(
  world: WorldState,
  hero: Character,
  input: PlayerInput,
  rng: Rng,
  events: SimEvent[],
  dt: number,
): void {
  const p = world.player;
  const move = len(input.move) > 1 ? normalize(input.move) : input.move;
  p.pos = add(p.pos, scale(move, hero.speed * dt));
  applyKnockback(p, dt);
  confine(p, world.room);

  if (dist(input.aim, p.pos) > 1) p.facing = angleOf(sub(input.aim, p.pos));

  p.attackCooldown = Math.max(0, p.attackCooldown - dt);
  if (!input.attack || p.attackCooldown > 0) return;

  const atk = hero.attack;
  const arc = (atk.arcDegrees * Math.PI) / 180;
  p.attackCooldown = atk.cooldown;
  events.push({ type: "swing", actorId: p.id, angle: p.facing, arc, range: p.radius + atk.range });

  for (const m of world.monsters) {
    const toM = sub(m.pos, p.pos);
    const reach = p.radius + atk.range + m.radius;
    if (len(toM) > reach) continue;
    // Monsters overlapping the player are always hit; otherwise they must be inside the arc.
    if (len(toM) > p.radius + m.radius && Math.abs(angleDiff(angleOf(toM), p.facing)) > arc / 2) continue;

    const amount = rng.int(atk.damage[0], atk.damage[1]);
    m.life -= amount;
    m.knock = add(m.knock, scale(normalize(toM), atk.knockback));
    events.push({ type: "damage", targetId: m.id, amount, pos: { ...m.pos } });
  }

  const before = world.monsters.length;
  world.monsters = world.monsters.filter((m) => {
    if (m.life > 0) return true;
    events.push({ type: "death", actorId: m.id, pos: { ...m.pos } });
    return false;
  });
  world.kills += before - world.monsters.length;
}

function updateMonsters(world: WorldState, content: SimContent, events: SimEvent[], dt: number): void {
  const p = world.player;
  for (const m of world.monsters) {
    const def = lookup(content.monsters, m.defId, "monster");
    const toP = sub(p.pos, m.pos);
    const d = len(toP);
    m.facing = angleOf(toP);

    // Chase, stopping at contact range so it doesn't jitter through the player.
    const gap = d - (p.radius + m.radius);
    if (gap > 0) m.pos = add(m.pos, scale(normalize(toP), Math.min(def.speed * dt, gap)));

    // Separation from other monsters so packs spread instead of stacking.
    for (const o of world.monsters) {
      if (o === m) continue;
      const overlap = m.radius + o.radius - dist(m.pos, o.pos);
      if (overlap > 0) m.pos = add(m.pos, scale(normalize(sub(m.pos, o.pos)), overlap * SEPARATION_STRENGTH));
    }

    applyKnockback(m, dt);
    confine(m, world.room);

    m.contactCooldown = Math.max(0, m.contactCooldown - dt);
    if (m.contactCooldown === 0 && dist(m.pos, p.pos) <= p.radius + m.radius + 2) {
      m.contactCooldown = def.contactCooldown;
      p.life = Math.max(0, p.life - def.damage);
      events.push({ type: "damage", targetId: p.id, amount: def.damage, pos: { ...p.pos } });
      if (p.life === 0) {
        world.status = "dead";
        events.push({ type: "player_died" });
        return;
      }
    }
  }
}

function updateSpawns(world: WorldState, content: SimContent, rng: Rng, events: SimEvent[], dt: number): void {
  const room = content.testRoom;
  world.spawnTimer -= dt;
  if (world.spawnTimer > 0) return;
  world.spawnTimer = room.spawnInterval;
  if (world.monsters.length < room.maxMonsters) spawnMonster(world, content, rng, events);
}

function spawnMonster(world: WorldState, content: SimContent, rng: Rng, events: SimEvent[]): void {
  const room = content.testRoom;
  const def = lookup(content.monsters, room.monster, "monster");
  const margin = def.radius + 8;
  let pos: Vec = { x: margin, y: margin };
  // Pick a point away from the player; a handful of tries is plenty in an open room.
  for (let i = 0; i < 12; i++) {
    pos = { x: rng.range(margin, room.width - margin), y: rng.range(margin, room.height - margin) };
    if (dist(pos, world.player.pos) >= room.minSpawnDistance) break;
  }
  const id = world.nextId++;
  world.monsters.push({
    id,
    defId: def.id,
    pos,
    knock: { x: 0, y: 0 },
    radius: def.radius,
    life: def.life,
    maxLife: def.life,
    facing: 0,
    contactCooldown: def.contactCooldown / 2,
  });
  events.push({ type: "spawn", actorId: id });
}

function applyKnockback(a: Actor, dt: number): void {
  a.pos = add(a.pos, scale(a.knock, dt));
  a.knock = scale(a.knock, Math.exp(-KNOCKBACK_DECAY * dt));
}

function confine(a: Actor, room: { width: number; height: number }): void {
  a.pos = { x: clamp(a.pos.x, a.radius, room.width - a.radius), y: clamp(a.pos.y, a.radius, room.height - a.radius) };
}
