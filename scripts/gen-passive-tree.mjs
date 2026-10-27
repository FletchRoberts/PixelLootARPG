// Generates src/data/passive-tree.json: the character passive tree.
//
// Layout (tree space, px; y grows downward like the screen):
//   start in the centre → an inner ring of 12 attribute nodes → six sectors
//   (Int top, Dex lower right, Str lower left, and the hybrids between them).
//   Each sector: a spoke out to a first wheel (ring of small nodes around a notable),
//   a second spoke to a bigger wheel with two notables, a side cluster, and a keystone at
//   the rim. Bridges connect neighbouring sectors' wheels so paths can cross over.
//
// Themes (stats, notables, keystones) are below; edit them and run:
//   node scripts/gen-passive-tree.mjs
// Same input → same tree (no randomness), so node ids stay stable for saves.

import { writeFileSync } from "node:fs";

const mod = (stat, kind, value, tags) => (tags ? { stat, kind, value, tags } : { stat, kind, value });
const inc = (stat, value, tags) => mod(stat, "increased", value, tags);
const flat = (stat, value, tags) => mod(stat, "flat", value, tags);
const more = (stat, value, tags) => mod(stat, "more", value, tags);

/** Each sector: angle (degrees, 0 = right, 90 = up), small-node pool, notables, keystone. */
const SECTORS = [
  {
    id: "int",
    name: "Intelligence",
    angle: 90,
    smalls: [
      ["+8 Intelligence", [flat("intelligence", 8)]],
      ["+12 to maximum Mana", [flat("mana", 12)]],
      ["10% increased Spell Damage", [inc("damage", 10, ["spell"])]],
      ["8% increased Elemental Damage", [inc("damage", 8, ["elemental"])]],
      ["+0.6 Mana Regeneration per second", [flat("mana_regen", 0.6)]],
      ["5% increased Cast Speed", [inc("cast_speed", 5, ["spell"])]],
    ],
    notables: [
      ["Arcane Flow", [flat("mana_regen", 1.5), flat("mana", 25)]],
      ["Spellweaver", [inc("damage", 25, ["spell"])]],
      ["Quick Casting", [inc("cast_speed", 12, ["spell"])]],
      ["Elementalist", [inc("damage", 20, ["elemental"]), flat("fire_resistance", 8), flat("cold_resistance", 8), flat("lightning_resistance", 8)]],
    ],
    keystone: {
      name: "Twin Cast",
      text: ["Your spells are supported by Echo", "30% less Spell Damage"],
      stats: [more("damage", -30, ["spell"])],
      grants: [{ support: "echo", tags: ["spell"] }],
    },
  },
  {
    id: "int_dex",
    name: "Frost and Flight",
    angle: 30,
    smalls: [
      ["+4 Intelligence, +4 Dexterity", [flat("intelligence", 4), flat("dexterity", 4)]],
      ["10% increased Cold Damage", [inc("cold_damage", 10)]],
      ["8% increased Projectile Damage", [inc("damage", 8, ["projectile"])]],
      ["10% increased Projectile Speed", [inc("projectile_speed", 10, ["projectile"])]],
      ["+8% to Cold Resistance", [flat("cold_resistance", 8)]],
    ],
    notables: [
      ["Hoarfrost", [inc("cold_damage", 25), flat("cold_resistance", 10)]],
      ["Far Shot", [inc("damage", 18, ["projectile"]), inc("projectile_speed", 20, ["projectile"])]],
      ["Winter's Edge", [inc("cold_damage", 15), inc("crit_chance", 30)]],
    ],
    keystone: {
      name: "Piercing Doctrine",
      text: ["Projectiles Pierce 3 additional targets", "20% less Projectile Damage"],
      stats: [flat("pierce", 3, ["projectile"]), more("damage", -20, ["projectile"])],
    },
  },
  {
    id: "dex",
    name: "Dexterity",
    angle: 330,
    smalls: [
      ["+8 Dexterity", [flat("dexterity", 8)]],
      ["+20 to Evasion Rating", [flat("evasion", 20)]],
      ["5% increased Attack Speed", [inc("attack_speed", 5, ["attack"])]],
      ["8% increased Projectile Damage", [inc("damage", 8, ["projectile"])]],
      ["+25 to Accuracy Rating", [flat("accuracy", 25)]],
      ["10% increased Critical Strike Chance", [inc("crit_chance", 10)]],
    ],
    notables: [
      ["Fleet Foot", [inc("movement_speed", 8), inc("evasion", 15)]],
      ["Deadeye", [inc("damage", 25, ["projectile"]), flat("accuracy", 50)]],
      ["Quick Draw", [inc("attack_speed", 12, ["attack"])]],
      ["Keen Edge", [inc("crit_chance", 40), flat("crit_bonus", 15)]],
    ],
    keystone: {
      name: "Endless Volley",
      text: ["Skills fire 2 additional Projectiles", "35% less Projectile Damage"],
      stats: [flat("projectile_count", 2, ["projectile"]), more("damage", -35, ["projectile"])],
    },
  },
  {
    id: "dex_str",
    name: "Blade and Blood",
    angle: 270,
    smalls: [
      ["+4 Strength, +4 Dexterity", [flat("strength", 4), flat("dexterity", 4)]],
      ["8% increased Attack Damage", [inc("damage", 8, ["attack"])]],
      ["+8 to maximum Life, +12 to Evasion Rating", [flat("life", 8), flat("evasion", 12)]],
      ["4% increased Attack Speed", [inc("attack_speed", 4, ["attack"])]],
      ["0.4% of Attack Damage Leeched as Life", [flat("life_leech", 0.4, ["attack"])]],
    ],
    notables: [
      ["Duelist's Grace", [inc("damage", 15, ["attack"]), inc("attack_speed", 6, ["attack"])]],
      ["Bloodletter", [flat("life_leech", 1.5, ["attack"]), flat("life", 15)]],
      ["Momentum", [inc("movement_speed", 6), inc("attack_speed", 8, ["attack"])]],
    ],
    keystone: {
      name: "Vampiric Pact",
      text: ["4% of Damage Leeched as Life", "25% less maximum Mana"],
      stats: [flat("life_leech", 4), more("mana", -25)],
    },
  },
  {
    id: "str",
    name: "Strength",
    angle: 210,
    smalls: [
      ["+8 Strength", [flat("strength", 8)]],
      ["+12 to maximum Life", [flat("life", 12)]],
      ["10% increased Armour", [inc("armour", 10)]],
      ["8% increased Melee Damage", [inc("damage", 8, ["melee"])]],
      ["8% increased Physical Damage", [inc("physical_damage", 8)]],
      ["+15 to Armour", [flat("armour", 15)]],
    ],
    notables: [
      ["Iron Hide", [flat("life", 25), inc("armour", 25)]],
      ["Brutal Force", [inc("damage", 20, ["melee"]), flat("strength", 10)]],
      ["Heavy Hands", [inc("physical_damage", 20), flat("knockback", 20)]],
      ["Unbreakable", [inc("armour", 35), flat("fire_resistance", 10)]],
    ],
    keystone: {
      name: "Juggernaut's Oath",
      text: ["50% more Armour", "20% more maximum Life", "15% less Movement Speed"],
      stats: [more("armour", 50), more("life", 20), more("movement_speed", -15)],
    },
  },
  {
    id: "str_int",
    name: "Fire and Ruin",
    angle: 150,
    smalls: [
      ["+4 Strength, +4 Intelligence", [flat("strength", 4), flat("intelligence", 4)]],
      ["10% increased Fire Damage", [inc("fire_damage", 10)]],
      ["8% increased Area of Effect", [inc("area_of_effect", 8)]],
      ["+8 to maximum Life, +8 to maximum Mana", [flat("life", 8), flat("mana", 8)]],
      ["+8% to Fire Resistance", [flat("fire_resistance", 8)]],
    ],
    notables: [
      ["Pyromancer", [inc("fire_damage", 25), flat("ignite_chance", 10)]],
      ["Wide Reach", [inc("area_of_effect", 20), inc("damage", 10, ["area"])]],
      ["Ember Heart", [inc("fire_damage", 15), flat("life", 20)]],
    ],
    keystone: {
      name: "Cataclysm",
      text: ["30% more Area Damage", "25% increased Area of Effect", "20% less Cast and Attack Speed"],
      stats: [more("damage", 30, ["area"]), inc("area_of_effect", 25), more("cast_speed", -20), more("attack_speed", -20)],
    },
  },
];

const nodes = new Map();
const R = (n) => Math.round(n);
function node(id, kind, name, x, y, stats = [], extra = {}) {
  if (nodes.has(id)) throw new Error(`duplicate node ${id}`);
  nodes.set(id, { id, kind, name, x: R(x), y: R(y), stats, links: [], ...extra });
  return id;
}
function link(a, b) {
  const na = nodes.get(a);
  const nb = nodes.get(b);
  if (!na.links.includes(b)) na.links.push(b);
  if (!nb.links.includes(a)) nb.links.push(a);
}
/** Polar → tree space (90° is up). */
const at = (deg, r) => ({ x: Math.cos((deg * Math.PI) / 180) * r, y: -Math.sin((deg * Math.PI) / 180) * r });

let smallCounter = 0;
function small(sector, id, x, y) {
  const [name, stats] = sector.smalls[smallCounter++ % sector.smalls.length];
  return node(id, "small", name, x, y, stats);
}

// Start and the inner ring.
node("start", "start", "Wanderer's Root", 0, 0);
const ring = [];
for (let k = 0; k < 12; k++) {
  const deg = k * 30;
  const sector = SECTORS.reduce((best, s) => (angleGap(s.angle, deg) < angleGap(best.angle, deg) ? s : best));
  const p = at(deg, 170);
  const id = `ring_${k}`;
  smallCounter = k;
  ring.push(small(sector, id, p.x, p.y));
}
ring.forEach((id, k) => link(id, ring[(k + 1) % 12]));
for (const s of SECTORS) if (["int", "dex", "str"].includes(s.id)) link("start", ring[Math.round(s.angle / 30) % 12]);

function angleGap(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** A wheel: ring of `n` small nodes around a centre; notables sit at the centre (linked to opposite ring nodes). */
function wheel(sector, prefix, deg, r, n, notables) {
  const c = at(deg, r);
  const ids = [];
  for (let k = 0; k < n; k++) {
    // Ring node 0 faces the tree centre (the entry).
    const a = ((deg + 180 + (k * 360) / n) * Math.PI) / 180;
    ids.push(small(sector, `${prefix}_${k}`, c.x + Math.cos(a) * 82, c.y - Math.sin(a) * 82));
  }
  ids.forEach((id, k) => link(id, ids[(k + 1) % n]));
  const centres = notables.map((nt, k) => {
    const off = notables.length === 1 ? { x: 0, y: 0 } : at(deg + 90 + k * 180, 26);
    const id = node(`${prefix}_n${k}`, "notable", nt[0], c.x + off.x, c.y + off.y, nt[1]);
    // Reached from the ring node on the far side of the entry (or the sides for two notables).
    const via = notables.length === 1 ? [Math.floor(n / 2)] : [Math.floor(n / 4) + k * Math.floor(n / 2)];
    for (const v of via) link(id, ids[v % n]);
    return id;
  });
  // left = clockwise side (angle − 90°), right = counter-clockwise side (angle + 90°).
  return { ring: ids, centres, entry: ids[0], exit: ids[Math.floor(n / 2)], left: ids[Math.floor(n / 4)], right: ids[Math.floor((3 * n) / 4)] };
}

/** A straight chain of `count` small nodes from `fromId` toward point `to`; returns the last id. */
function chain(sector, prefix, fromId, to, count) {
  const from = nodes.get(fromId);
  let prev = fromId;
  for (let k = 1; k <= count; k++) {
    const t = k / (count + 1);
    const id = small(sector, `${prefix}_${k}`, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    link(prev, id);
    prev = id;
  }
  return prev;
}

const wheels1 = {};
const wheels2 = {};
for (const s of SECTORS) {
  smallCounter = 0;
  const gate = ring[Math.round(s.angle / 30) % 12];
  const w1 = wheel(s, `${s.id}_w1`, s.angle, 560, 6, [s.notables[0]]);
  const last1 = chain(s, `${s.id}_s1`, gate, nodes.get(w1.entry), 3);
  link(last1, w1.entry);
  const w2 = wheel(s, `${s.id}_w2`, s.angle, 880, 8, [s.notables[1], s.notables[2]]);
  const last2 = chain(s, `${s.id}_s2`, w1.exit, nodes.get(w2.entry), 2);
  link(last2, w2.entry);
  // Keystone at the rim, two steps past the outer wheel.
  const kp = at(s.angle, 1160);
  const kid = node(`${s.id}_keystone`, "keystone", s.keystone.name, kp.x, kp.y, s.keystone.stats, {
    text: s.keystone.text,
    ...(s.keystone.grants ? { grants: s.keystone.grants } : {}),
  });
  const last3 = chain(s, `${s.id}_s3`, w2.exit, kp, 2);
  link(last3, kid);
  // Side cluster off the middle spoke: two smalls and a notable.
  if (s.notables[3]) {
    const side = at(s.angle - 16, 720);
    const sid = node(`${s.id}_side_n`, "notable", s.notables[3][0], side.x, side.y, s.notables[3][1]);
    const lastSide = chain(s, `${s.id}_side`, w1.left, side, 2);
    link(lastSide, sid);
  }
  wheels1[s.id] = w1;
  wheels2[s.id] = w2;
}

// Bridges between neighbouring sectors (sorted by angle): wheel 1 ↔ wheel 1, wheel 2 ↔ wheel 2.
const byAngle = [...SECTORS].sort((a, b) => a.angle - b.angle);
byAngle.forEach((s, k) => {
  const t = byAngle[(k + 1) % byAngle.length];
  smallCounter = 0;
  // s is clockwise of t: leave s by its counter-clockwise side, enter t by its clockwise side.
  const a1 = wheels1[s.id].right;
  const b1 = wheels1[t.id].left;
  const end1 = chain(s, `bridge1_${s.id}_${t.id}`, a1, nodes.get(b1), 3);
  link(end1, b1);
  const a2 = wheels2[s.id].right;
  const b2 = wheels2[t.id].left;
  const end2 = chain(t, `bridge2_${s.id}_${t.id}`, a2, nodes.get(b2), 4);
  link(end2, b2);
});

const out = { start: "start", nodes: [...nodes.values()] };
writeFileSync(new URL("../src/data/passive-tree.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
const kinds = {};
for (const n of out.nodes) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
console.log(`passive tree: ${out.nodes.length} nodes`, kinds);
