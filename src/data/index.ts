import type {
  Affix,
  AttributeBonuses,
  Biome,
  Character,
  CombatRulesDef,
  Currency,
  DropTable,
  ItemBase,
  Monster,
  MonsterScaling,
  Progression,
  WeaponDef,
  ZoneGenConfig,
} from "../sim/data/types";
import itemBases from "./item-bases.json";
import affixes from "./affixes.json";
import currencies from "./currencies.json";
import monsters from "./monsters.json";
import dropTables from "./drop-tables.json";
import characters from "./characters.json";
import zoneGen from "./zone-gen.json";
import biomes from "./biomes.json";
import weapons from "./weapons.json";
import progression from "./progression.json";
import attributes from "./attributes.json";
import monsterScaling from "./monster-scaling.json";
import combat from "./combat.json";

export const content = {
  itemBases: itemBases as ItemBase[],
  affixes: affixes as Affix[],
  currencies: currencies as Currency[],
  monsters: monsters as Monster[],
  dropTables: dropTables as DropTable[],
  characters: characters as Character[],
  zoneGen: zoneGen as ZoneGenConfig,
  biomes: biomes as Biome[],
  weapons: weapons as WeaponDef[],
  progression: progression as Progression,
  attributes: attributes as AttributeBonuses,
  monsterScaling: monsterScaling as MonsterScaling,
  combat: combat as CombatRulesDef,
};

export type Content = typeof content;
