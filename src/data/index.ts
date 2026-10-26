import type { Affix, Biome, Character, Currency, DropTable, ItemBase, Monster, ZoneGenConfig } from "../sim/data/types";
import itemBases from "./item-bases.json";
import affixes from "./affixes.json";
import currencies from "./currencies.json";
import monsters from "./monsters.json";
import dropTables from "./drop-tables.json";
import characters from "./characters.json";
import zoneGen from "./zone-gen.json";
import biomes from "./biomes.json";

export const content = {
  itemBases: itemBases as ItemBase[],
  affixes: affixes as Affix[],
  currencies: currencies as Currency[],
  monsters: monsters as Monster[],
  dropTables: dropTables as DropTable[],
  characters: characters as Character[],
  zoneGen: zoneGen as ZoneGenConfig,
  biomes: biomes as Biome[],
};

export type Content = typeof content;
