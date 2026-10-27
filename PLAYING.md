# How to play (current build)

Updated with every change. If something here doesn't match the game, the game is wrong: tell Claude.

## Run it (Windows, Command Prompt)

First time only (needs Node.js 22+ and Git installed):
```
git clone https://github.com/FletchRoberts/PixelLootARPG.git
cd PixelLootARPG
npm install
```

Every time:
```
cd PixelLootARPG
git pull
npm install
npm run dev
```
Then open **http://localhost:5173** in Chrome or Edge. Stop with `Ctrl+C` (answer `Y`).

**PowerShell says "running scripts is disabled on this system"?** You're in PowerShell, not Command Prompt (the prompt starts with `PS`). Either type `npm.cmd` instead of `npm` (`npm.cmd install`, `npm.cmd run dev`), or run this once and answer `Y`, after which plain `npm` works:
```
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## Controls

| Action | Keyboard + mouse | PS5 controller |
|---|---|---|
| Move | WASD / arrows | Left stick |
| Aim | Mouse | Right stick (leave it alone and aim assist targets the nearest enemy) |
| Weapon attack | Hold left click | Hold R2 |
| Skill 1 / 2 / 3 / 4 | Right click / Q / E / R | R1 / □ / △ / L1 |
| Dodge roll | Space | ○ |
| **Pick up** the highlighted item | F | ✕ |
| Menu (Character / Gear / Gems / Currency / Debug, pauses the game) | C | Options |
| Salvage the selected bag item (Gear tab) | X | □ |
| Straight to Gear | I | Touchpad click (or Options → R1) |
| Next zone / retry | Enter, Space or click | ✕ |

**In the menu:** D-pad / WASD to move, ✕ / Enter to choose, ○ / Esc to go back or close, L1 / R1 (Q / Tab) to switch tabs.

Controller: plug it in, open the page, press any button. A "Controller connected" message appears.

## What to do

1. **Your character is saved in the browser.** Refreshing or closing the page keeps your level, gear, gems and bag. (Menu → Debug → Reset character starts over.)
2. **Maps:** between runs the **Map Device** opens.
   - Pick a **Cairnstone** (map item) with ✕: it is used up and opens a map at its **level** (= monster level) with its **map mods**. Mods make monsters tougher (more life, damage, speed, extra fire/cold/lightning damage, resistances, evasion, armour, bigger packs) and each one also adds **item quantity or rarity**.
   - No stones (or don't want to use one)? **Run without a Cairnstone**: a free map 1 level below your best, with up to 2 weak random mods.
   - **Every cleared map gives a new Cairnstone** (sometimes one level higher), and monsters can drop them too, so you build a stock and push higher.
   - **Dying retries the same map** (same layout and mods), as many times as you like.
   - At the Map Device: **□ / X** salvages a stone into fragments, **Options / C** opens the menu so you can **craft stones in the Currency tab** (Whetstone, Crown Ember, Riftglass, Chaos Thread, Void Pearl… all work on stones).
3. You start with a **Rusty Sword** equipped, **Frost Bolt** on Skill 1 (R1 / right click) and one random support gem.
4. **Monsters drop loot**: gear, gems, currency and Cairnstones. Names on the floor are coloured by type:
   - **white** = normal gear, **blue** = magic (1–2 mods), **yellow** = rare (4–6 mods), **orange** = unique,
   - **teal** = gems, **gold** = currency.

   Separate inventories: a gear bag (40), a gem bag (40), a Cairnstone bag (60), and a currency stash with no limit.

   The closest item shows the pick-up button: **✕ / F**. The end-of-zone pack drops the most.
5. **Menu → Gear** (touchpad / I goes straight there):
   - The top 9 rows are your equipment slots; below them is the gear in your bag.
   - Select an item to see its tooltip: item level, requirements, its mods with their **tier** (T1 is best).
   - Under the tooltip, **green and red lines show exactly what would change** if you equip it (life, defences, resistances, attributes, move speed, and the DPS of your attack and each skill), followed by what you're currently wearing in that slot. On an equipped item it shows what you'd lose by taking it off.
   - **Rings:** if a ring slot is free it goes there; if you wear two, press **←/→** to choose which one to replace (the tooltip says "left ring" / "right ring").
   - ✕ / Enter on a bag item **equips** it (whatever was there goes back to the bag). ✕ on a slot **takes it off**.
   - **□ / X salvages** a bag item into currency fragments (rares and uniques ask you to press twice). Equipped items can't be salvaged.
   - Better items need a **level** and sometimes **Strength / Dexterity / Intelligence**. Attribute mods on other gear can get you there.
   - The **weapon decides your R2 attack**: swords swing, bows shoot arrows, wands fire lightning bolts. Take your weapon off and you punch.
6. **Uniques change your skills.** Examples: *Duplicator's Coil* gives every projectile skill Volley, *Glacier Heart* adds cold damage to everything, *The Patient Blade* makes your attacks Echo.
7. **Menu → Gems:** equip skill gems on your 4 buttons and socket support gems.
   - **Level a skill gem by feeding it a duplicate**: press ✕ on the equipped gem and choose "Level up: feed a copy". The copy adds its own level, up to level 10. Sockets grow at levels 3, 6 and 9 (2 → 5).
   - At max level, extra copies just become a fresh gem to level.
   - Support gems don't level; extra copies let you socket the same support into several skills.
   - Taking a skill gem off (or swapping it) puts its supports back in your bag.
8. **Menu → Currency** (L1/R1 to the 4th tab):
   - Lists every currency with how many you have, and fragment progress (e.g. "fragments 7/10"). **10 fragments turn into the full currency automatically.**
   - Pick a currency with ✕, then pick an item (worn gear, bag gear, Cairnstones, or skill gems for Cutter's Prism). Only items it works on are listed. The item's tooltip shows below.
   - ✕ uses it. You stay on the same item, so you can keep pressing ✕ to keep crafting. The lines that changed show as **+** (gained) and **−** (lost). ○ goes back.
   - Currencies: **Whetstone Shard** normal → magic · **Tinker's Spark** reroll a magic item · **Gilded Seal** add a mod to magic · **Crown Ember** magic → rare · **Binding Coin** normal → rare · **Riftglass** add a mod to a rare · **Unmaking Salt** remove a mod · **Chaos Thread** swap one mod on a rare · **Lodestone** reroll the numbers · **Void Pearl** corrupt (gamble; the item is then locked) · **Cutter's Prism** +1 skill gem level.
   - **Salvage** rows at the bottom clear your bags in bulk: all normal / magic / rare gear (rare asks twice; uniques never), spare support gems (keeps one of each), spare skill gems (keeps the best copy).
   - Salvage gives: normal → Whetstone Fragment, magic → Crown Ember Fragment, rare → Chaos Thread Fragment, unique → 3 Void Pearl Fragments, gems → Cutter's Prism Fragments.
9. Higher-level maps drop **higher item level** gear: better bases and stronger mod tiers.
10. **Dying** keeps everything and costs 10% of your current level's XP (never a level). You retry the same map.
11. **Menu → Debug** can spawn random gear of any rarity, any unique, rare weapons, Cairnstones, any gem, 5 of every currency, or reset the character.

## Reading the screen

- Top left: life and mana bars, level, map name and monster level, map mods + bonus rewards (and deaths on this map), kills, timer, button hints.
- Bottom: skill bar (button, skill, mana cost; dim when you can't afford it) and the XP bar.
- Damage numbers: white = your hits, **yellow with "!" = critical**, red = damage you take, grey "evade" = dodged.
- Loot on the floor: name coloured by rarity (gems teal); the one you'd pick up is highlighted with the button to press. Coloured squares on the minimap.
- Enemy status: **blue ring = chilled** (slowed), **solid icy disc = frozen** (can't move or attack), **flickering embers = burning**.
- Menu → Character tab: attributes, defences, and damage/speed/DPS for your weapon attack and each skill.

## New in this version

- **Cairnstones and the Map Device:** choose which map to run; stones carry map mods (danger + bonus loot) and can be crafted with currency.
- **Guaranteed Cairnstone** for every cleared map; monsters drop them too.
- **Free maps** when you have no stone; **unlimited retries** on death.
- The HUD shows the map's name, monster level, mod count and bonus rewards.
- Existing characters get a Cairnstone at the level they had reached.

## Extras

- `http://localhost:5173/?seed=303` loads a specific zone layout.
