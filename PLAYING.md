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
| Auto attack on/off | T | Create (left of touchpad) |
| Manual attack (aims where you point) | Hold left click | Hold R2 or □ |
| Aim (manual attacks) | Mouse | Right stick, else aim assist |
| Character sheet | C | Options |
| Next zone / retry | E, Enter, Space or click | ✕ |

Controller: plug it in, open the page, press any button. A "Controller connected" message appears.

## What to do

1. **Auto attack is on by default.** Walk up to enemies and your sword swings at the nearest one in reach by itself. Hold attack if you want to aim swings yourself.
2. Follow the winding path. The minimap (top right) shows you (white), the exit (blue) and monsters (red, brighter when awake).
3. Husk packs sleep until you get close, then the whole pack chases you. They hurt on contact, and there's no healing yet, so don't get surrounded.
4. Kills give **XP** (gold bar along the bottom). Levelling up gives more life, mana and +1 Strength/Dexterity/Intelligence.
5. Reach the glowing EXIT to clear the zone. **Each cleared zone makes the next one one monster level higher**: tougher, but worth more XP. Your level carries over.
6. If you die, confirm retries the same zone from the level you entered it at.

## Reading the screen

- Top left: life (red) and mana (blue) bars, level, zone name and monster level, kills, timer, auto attack state.
- Damage numbers: white = your hits, **yellow with "!" = critical hit** (double damage), red = damage you take, grey "evade" = a dodged attack.
- Character sheet (C / Options): attributes, life/mana, armour/evasion/accuracy, resistances, and your weapon's damage, speed, crit and DPS.

## New in this version

- Auto attack (sword), with a toggle.
- Levels and XP, Strength/Dexterity/Intelligence, mana bar (nothing spends mana yet; skills come next).
- Zones get harder as you clear them (monster level).
- Real combat math under the hood: armour, evasion, resistances, crits (docs/combat.md).
- Character sheet.

## Extras

- `http://localhost:5173/?seed=303` loads a specific zone layout.
