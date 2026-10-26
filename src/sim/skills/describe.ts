// Human-readable breakdown of a compiled skill, e.g. for the loadout panel and tooltips:
//   Frost Bolt: 8.4 mana, 0.45 s
//   3 × projectile, 8–11 cold
//     on end → 7 × projectile (ring), 3–5 cold   [21 total]

import { scaledRange, DAMAGE_TYPES } from "../combat/damage";
import type { CompiledSkill } from "./types";

export function describeSkill(skill: CompiledSkill): string[] {
  const head = skill.trigger
    ? `${skill.name}: casts itself on kill (${skill.trigger.cooldown} s cooldown, no mana)`
    : `${skill.name}: ${skill.cost > 0 ? `${skill.cost.toFixed(1)} mana, ` : ""}${skill.interval.toFixed(2)} s${skill.isAttack ? " (attack)" : ""}`;
  const lines = [head];
  if (skill.repeat) lines.push(`repeats ${skill.repeat.count}× after ${skill.repeat.delay} s`);

  const walk = (index: number, indent: string, prefix: string, parents: number) => {
    const n = skill.nodes[index]!;
    const dmg = DAMAGE_TYPES.map((t) => {
      const r = scaledRange({ base: n.base, tags: n.tags, critChance: 0, accuracy: 0, isAttack: skill.isAttack, damageEffectiveness: n.effectiveness }, n.mods, t);
      return r ? `${Math.round(r[0])}–${Math.round(r[1])} ${t}` : null;
    })
      .filter(Boolean)
      .join(", ");
    const what =
      n.kind === "melee"
        ? "melee strike"
        : n.kind === "area"
          ? `${n.shape === "sector" ? "cone" : "burst"} r${Math.round(n.radius)}`
          : `${n.count} × ${n.lobbed ? "lobbed " : ""}projectile${n.pattern === "ring" ? " (ring)" : ""}`;
    const extras = [
      n.pierce && `pierce ${n.pierce}`,
      n.chain && `chain ${n.chain}`,
      n.fork && `fork ${n.fork}`,
      n.igniteChance > 0 && `${Math.round(Math.min(100, n.igniteChance * n.procCoefficient))}% ignite`,
    ]
      .filter(Boolean)
      .join(", ");
    const total = parents > 1 && n.kind === "projectile" ? `   [${parents * n.count} total]` : "";
    lines.push(`${indent}${prefix}${what}${dmg ? `, ${dmg}` : ""}${extras ? `, ${extras}` : ""}${total}`);
    for (const [event, children] of Object.entries(n.on)) {
      for (const c of children ?? []) walk(c, indent + "  ", `on ${event} → `, parents * (n.kind === "projectile" ? n.count : 1));
    }
  };
  walk(0, "", "", 1);
  return lines;
}
