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
   - Select an item to see its tooltip: item level, requirements, its mods with their **tier** (T1 is best), and for bag items **what you're currently wearing** in that slot for comparison.
   - ✕ / Enter on a bag item **equips** it (whatever was there goes back to the bag). ✕ on a slot **takes it off**.
   - Better items need a **level** and sometimes **Strength / Dexterity / Intelligence**. Attribute mods on other gear can get you there.
   - The **weapon decides your R2 attack**: swords swing, bows shoot arrows, wands fire lightning bolts. Take your weapon off and you punch.
5. **Uniques change your skills.** Examples: *Duplicator's Coil* gives every projectile skill Volley, *Glacier Heart* adds cold damage to everything, *The Patient Blade* makes your attacks Echo.
6. **Menu → Gems:** equip skill gems on your 4 buttons and socket support gems, same as before. Skill gems level up as you kill things and gain sockets.
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

- **Gear!** 26 item types across 10 slots (weapon, helmet, body, gloves, boots, belt, amulet, 2 rings), with random magic and rare mods, and 5 uniques.
- **Weapons are items now**: find better swords, bows and wands (the debug weapon switcher is gone).
- **Gear tab** with tooltips, mod tiers and comparison against what you're wearing.
- **Requirements**: better items need levels and attributes.
- Your previous save carries over, with your old weapon equipped.

## Extras

- `http://localhost:5173/?seed=303` loads a specific zone layout.
