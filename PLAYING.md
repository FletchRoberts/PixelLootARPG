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
   - **Skills (pick any for each of the 4 buttons):**
     - **Frost Bolt**: cold bolt that chills.
     - **Fireball**: explodes on impact, can set enemies on fire.
     - **Ice Nova**: ring of cold around you, freezes weaker enemies.
     - **Earthsplitter**: long forward slam (uses your weapon's damage).
     - **Fanning Shot**: fan of 5 arrows (weapon damage).
     - **Magma Strike**: melee hit that lobs 3 magma balls which explode where they land.
   - **Supports:** up to 4 per skill, *including your weapon attack*:
     - **Volley** (+2 projectiles), **Pierce**, **Chain**, **Fork**, **Shatter** (burst into 5 shards).
     - **Echo**: the skill repeats itself 0.3 s later for free.
     - **Cast on Kill**: put it on a spell and that spell goes off by itself wherever you kill something. Its button then shows "on kill" and does nothing when pressed.
     - **Added Cold**: adds cold damage (your sword starts chilling and freezing).
     - **Concentrated**: smaller area, more damage.
     - **Knockback**: send enemies flying.
   - The right side of the panel spells out what your build does.
   - Combos to try:
     - Ice Nova + Cast on Kill, then fight with anything: chains of novas through a pack.
     - Fireball + Volley + Echo: six fireballs per press.
     - Magma Strike + Volley: 5 magma balls per enemy hit.
     - Sword + Added Cold + Knockback: freeze and shove.
4. **Dodge roll** (○ / Space) dashes you out of trouble. While rolling, enemies can't hurt you by touch.
5. Follow the path. Packs sleep until you get close, then chase you. Kills give XP; level-ups add life, mana and attributes.
6. Reach the glowing EXIT to clear the zone. Each cleared zone raises the monster level by 1. Your level and loadout carry over.
7. If you die, confirm retries the same zone.

## Reading the screen

- Top left: life and mana bars, level, zone name and monster level, kills, timer, button hints.
- Bottom: skill bar (button, skill, mana cost; dim when you can't afford it) and the XP bar.
- Damage numbers: white = your hits, **yellow with "!" = critical**, red = damage you take, grey "evade" = dodged.
- Enemy status: **blue ring = chilled** (slowed), **solid icy disc = frozen** (can't move or attack), **flickering embers = burning**.
- Menu → Character tab: attributes, defences, and damage/speed/DPS for your weapon attack and each skill.

## New in this version

- **5 new skills:** Fireball, Ice Nova, Earthsplitter, Fanning Shot, Magma Strike.
- **5 new supports:** Echo, Cast on Kill, Added Cold, Concentrated, Knockback.
- **Explosions and cones** (area attacks), with walls blocking them.
- **Chill, freeze and ignite**, shown on enemies as a blue ring, an icy disc and embers.

## Extras

- `http://localhost:5173/?seed=303` loads a specific zone layout.
