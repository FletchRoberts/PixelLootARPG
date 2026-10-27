import type {
  Affix,
  AttributeBonuses,
  Biome,
  Character,
  CombatRulesDef,
  CraftingRules,
  Currency,
  DropTable,
  GearRules,
  GemRules,
  ItemBase,
  Monster,
  MonsterScaling,
  Progression,
  UniqueDef,
  WeaponDef,
  ZoneGenConfig,
} from "../sim/data/types";
import type { SkillDef, SupportDef } from "../sim/skills/types";
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
import skills from "./skills.json";
import supports from "./supports.json";
import gems from "./gems.json";
import uniques from "./uniques.json";
import gear from "./gear.json";
import crafting from "./crafting.json";

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
  skills: skills as SkillDef[],
  supports: supports as SupportDef[],
  gems: gems as GemRules,
  uniques: uniques as UniqueDef[],
  gear: gear as GearRules,
  crafting: crafting as CraftingRules,
};

export type Content = typeof content;
