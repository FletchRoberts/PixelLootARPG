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
| Pick up (nothing drops yet) | F | ✕ |
| Menu (Character + Skills tabs, pauses the game) | C | Options |
| Straight to the Skills tab | I | Touchpad click |
| Next zone / retry | Enter, Space or click | ✕ |

**In the menu:** up/down to pick a row, left/right (or ✕ / Enter) to change it, L1/R1 (Q/Tab) to switch tabs, ○ / Esc to close.

Controller: plug it in, open the page, press any button. A "Controller connected" message appears.

## What to do

1. **Hold R2 / left click to attack with your weapon.** Nothing attacks on its own. On controller you don't need to aim precisely: with the right stick untouched, aim assist turns your attacks and skills toward the nearest enemy you can see (preferring ones in front of you). Use the right stick when you want to aim yourself.
2. **Skills:** you start with **Frost Bolt on Skill 1** (R1 / right click). Hold the button to keep casting toward where you aim. Each cast costs mana (blue bar). If you run dry you'll see "Not enough mana".
3. **Build combos in the menu's Skills tab** (Options → R1, or touchpad / I). It's a debug editor until gems drop as loot:
   - **Weapon:** Rusty Sword (melee swing), Short Bow (arrows) or Apprentice Wand (lightning bolts). The weapon decides what R2 / left click does.
   - **Skill 1–4:** pick a skill for each button (only Frost Bolt exists so far).
   - **Supports:** up to 4 per skill, *including your weapon attack*: **Volley** (+2 projectiles), **Pierce** (goes through 2 enemies), **Chain** (bounces to another enemy), **Fork** (splits in two on hit), **Shatter** (bursts into 5 shards when it ends).
   - The right side of the panel spells out what your build does, e.g. "3 × projectile … on end → 7 × projectile (ring) [21 total]".
   - Try: Frost Bolt + Volley + Shatter, or Wand attack + Fork + Chain, or Bow + Pierce + Shatter. More supports = higher mana cost.
4. **Dodge roll** (○ / Space) dashes you out of trouble. While rolling, enemies can't hurt you by touch.
5. Follow the path. Packs sleep until you get close, then chase you. Kills give XP; level-ups add life, mana and attributes.
6. Reach the glowing EXIT to clear the zone. Each cleared zone raises the monster level by 1. Your level and loadout carry over.
7. If you die, confirm retries the same zone.

## Reading the screen

- Top left: life and mana bars, level, zone name and monster level, kills, timer, button hints.
- Bottom: skill bar (button, skill, mana cost; dim when you can't afford it) and the XP bar.
- Damage numbers: white = your hits, **yellow with "!" = critical**, red = damage you take, grey "evade" = dodged.
- Menu → Character tab: attributes, defences, and damage/speed/DPS for your weapon attack and each skill.

## New in this version

- **Auto attack removed.** Your weapon attacks only while you hold R2 / left click. The T / Create toggle is gone.
- **Aim assist kept and improved:** it now also targets sleeping enemies, and never aims at enemies behind walls.

## Extras

- `http://localhost:5173/?seed=303` loads a specific zone layout.
