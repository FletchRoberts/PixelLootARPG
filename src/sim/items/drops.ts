// Weighted, nestable drop tables (src/data/drop-tables.json).

import type { Rng } from "../core/rng";
import type { DropTable } from "../data/types";
import type { GemItem } from "./types";

export interface DropContent {
  dropTables: DropTable[];
  skills: { id: string }[];
  supports: { id: string }[];
}

/** What a roll produced, before it becomes an item (the world rolls gear and assigns uids). */
export type DropResult = { kind: GemItem["kind"]; defId: string } | { kind: "gear"; base?: string } | { kind: "unique"; unique?: string };

const MAX_NESTING = 5;

export function rollDrops(content: DropContent, tableId: string, rng: Rng, depth = 0): DropResult[] {
  const table = content.dropTables.find((t) => t.id === tableId);
  if (!table || depth > MAX_NESTING) return [];
  const out: DropResult[] = [];
  for (let r = 0; r < table.rolls; r++) {
    const entry = rng.weighted(table.entries);
    if (!entry) continue;
    if (entry.kind === "table" && entry.ref) out.push(...rollDrops(content, entry.ref, rng, depth + 1));
    else if (entry.kind === "skill_gem" || entry.kind === "support_gem") {
      const pool = entry.kind === "skill_gem" ? content.skills : content.supports;
      const defId = entry.ref ?? pool[Math.floor(rng.next() * pool.length)]?.id;
      if (defId) out.push({ kind: entry.kind, defId });
    }
    else if (entry.kind === "item") out.push({ kind: "gear", base: entry.ref });
    else if (entry.kind === "unique") out.push({ kind: "unique", unique: entry.ref });
    // "nothing" drops nothing; "currency" waits for crafting currency.
  }
  return out;
}
