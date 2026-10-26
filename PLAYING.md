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
| **Pick up** the highlighted gem | F | ✕ |
| Menu (Character / Gear / Gems / Debug, pauses the game) | C | Options |
| Straight to Gear | I | Touchpad click (or Options → R1) |
| Next zone / retry | Enter, Space or click | ✕ |

**In the menu:** D-pad / WASD to move, ✕ / Enter to choose, ○ / Esc to go back or close, L1 / R1 (Q / Tab) to switch tabs.

Controller: plug it in, open the page, press any button. A "Controller connected" message appears.

## What to do

1. **Your character is saved in the browser.** Refreshing or closing the page keeps your level, gear, gems and bag. (Menu → Debug → Reset character starts over.)
2. You start with a **Rusty Sword** equipped, **Frost Bolt** on Skill 1 (R1 / right click) and one random support gem.
3. **Monsters drop loot**: gear and gems. Names on the floor are coloured by type:
   - **white** = normal gear, **blue** = magic (1–2 mods), **yellow** = rare (4–6 mods), **orange** = unique,
   - **teal** = gems.

   The closest item shows the pick-up button: **✕ / F**. The end-of-zone pack drops the most.
4. **Menu → Gear** (touchpad / I goes straight there):
   - The top 9 rows are your equipment slots; below them is the gear in your bag.
   - Select an item to see its tooltip: item level, requirements, its mods with their **tier** (T1 is best).
   - Under the tooltip, **green and red lines show exactly what would change** if you equip it (life, defences, resistances, attributes, move speed, and the DPS of your attack and each skill), followed by what you're currently wearing in that slot. On an equipped item it shows what you'd lose by taking it off.
   - **Rings:** if a ring slot is free it goes there; if you wear two, press **←/→** to choose which one to replace (the tooltip says "left ring" / "right ring").
   - ✕ / Enter on a bag item **equips** it (whatever was there goes back to the bag). ✕ on a slot **takes it off**.
   - Better items need a **level** and sometimes **Strength / Dexterity / Intelligence**. Attribute mods on other gear can get you there.
   - The **weapon decides your R2 attack**: swords swing, bows shoot arrows, wands fire lightning bolts. Take your weapon off and you punch.
5. **Uniques change your skills.** Examples: *Duplicator's Coil* gives every projectile skill Volley, *Glacier Heart* adds cold damage to everything, *The Patient Blade* makes your attacks Echo.
6. **Menu → Gems:** equip skill gems on your 4 buttons and socket support gems.
   - **Level a skill gem by feeding it a duplicate**: press ✕ on the equipped gem and choose "Level up: feed a copy". The copy adds its own level, up to level 10. Sockets grow at levels 3, 6 and 9 (2 → 5).
   - At max level, extra copies just become a fresh gem to level.
   - Support gems don't level; extra copies let you socket the same support into several skills.
   - Taking a skill gem off (or swapping it) puts its supports back in your bag.
7. Higher zones (monster level) drop **higher item level** gear: better bases and stronger mod tiers.
8. **Dying** keeps everything and costs 10% of your current level's XP (never a level). You retry the same zone.
9. **Menu → Debug** can spawn random gear of any rarity, any unique, rare weapons, any gem, or reset the character.

## Reading the screen

- Top left: life and mana bars, level, zone name and monster level, kills, timer, button hints.
- Bottom: skill bar (button, skill, mana cost; dim when you can't afford it) and the XP bar.
- Damage numbers: white = your hits, **yellow with "!" = critical**, red = damage you take, grey "evade" = dodged.
- Loot on the floor: name coloured by rarity (gems teal); the one you'd pick up is highlighted with the button to press. Coloured squares on the minimap.
- Enemy status: **blue ring = chilled** (slowed), **solid icy disc = frozen** (can't move or attack), **flickering embers = burning**.
- Menu → Character tab: attributes, defences, and damage/speed/DPS for your weapon attack and each skill.

## New in this version

- **Ring choice:** with two rings on, ←/→ picks which one a new ring replaces.
- **Green/red stat changes** when you look at gear: see exactly what you gain and lose before equipping.
- **Gem levelling changed:** gems no longer level from kills. Feed duplicate copies to level them (max 10).
- **Supports come back to your bag** when you take a skill gem off or swap it.

## Extras

- `http://localhost:5173/?seed=303` loads a specific zone layout.
