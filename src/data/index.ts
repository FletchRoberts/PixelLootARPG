import type { Affix, Character, Currency, DropTable, ItemBase, Monster, TestRoom } from "../sim/data/types";
import itemBases from "./item-bases.json";
import affixes from "./affixes.json";
import currencies from "./currencies.json";
import monsters from "./monsters.json";
import dropTables from "./drop-tables.json";
import characters from "./characters.json";
import testRoom from "./test-room.json";

export const content = {
  itemBases: itemBases as ItemBase[],
  affixes: affixes as Affix[],
  currencies: currencies as Currency[],
  monsters: monsters as Monster[],
  dropTables: dropTables as DropTable[],
  characters: characters as Character[],
  testRoom: testRoom as TestRoom,
};

export type Content = typeof content;
