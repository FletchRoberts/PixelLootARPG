// Items and the saved character. Plain data: everything here is serialised to the
// browser save and (later) sent over the network.

/** A skill or support gem. Skill gems carry their own support sockets (PoE2-style). */
export interface GemItem {
  uid: number;
  kind: "skill_gem" | "support_gem";
  defId: string; // skills.json / supports.json id
  level: number;
  xp: number;
  sockets?: (GemItem | null)[]; // skill gems only; length = current socket count
}

export type Item = GemItem; // gear, currency and Cairnstones join this union later

/** Something lying on the zone floor. */
export interface GroundItem {
  id: number;
  item: Item;
  pos: { x: number; y: number };
}

/** Where a support gem goes: a skill on the bar, or the weapon attack. */
export type SocketTarget = { kind: "skill"; slot: number } | { kind: "attack" };

/** Everything that persists between zones and browser sessions. */
export interface CharacterSave {
  version: 1;
  characterId: string;
  level: number;
  xp: number;
  zonesCleared: number;
  weapon: string;
  skillBar: (GemItem | null)[]; // one skill gem per button
  attackSockets: (GemItem | null)[]; // supports for the weapon attack
  bag: Item[];
  nextUid: number;
}
