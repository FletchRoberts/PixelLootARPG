// The character save lives in this browser's localStorage. Everything can fail
// (private mode, storage full, old/corrupt data), so every call is guarded and
// the game simply starts a new character when nothing usable is stored.

import { content } from "../../data";
import { migrateSave } from "../../sim/items/save";
import type { CharacterSave } from "../../sim/items/types";

const KEY = "arpg.character.v1";

export function loadSave(): CharacterSave | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrateSave(JSON.parse(raw), content); // older saves are upgraded in place
  } catch {
    return null;
  }
}

export function writeSave(save: CharacterSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Not persisted this time; the in-memory character is still fine.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
