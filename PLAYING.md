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
| Menu (Character / Inventory / Debug, pauses the game) | C | Options |
| Straight to Inventory | I | Touchpad click (or Options → R1) |
| Next zone / retry | Enter, Space or click | ✕ |

**In the menu:** D-pad / WASD to move, ✕ / Enter to choose, ○ / Esc to go back or close, L1 / R1 (Q / Tab) to switch tabs.

Controller: plug it in, open the page, press any button. A "Controller connected" message appears.

## What to do

1. **Your character is saved in the browser.** Refreshing or closing the page keeps your level, gems and bag. (Menu → Debug → Reset character starts over.)
2. You start with **Frost Bolt** on Skill 1 (R1 / right click) and **one random support gem** in your bag.
3. **Monsters drop gems.** They appear on the floor with a teal name; the closest one shows the pick-up button. Press **✕ / F** to pick it up. The end-of-zone pack drops the most. Gem colour = attribute: red Strength, green Dexterity, blue Intelligence.
4. **Equip them in Menu → Inventory:**
   - The top row is your **weapon attack** with 2 support sockets; below are your **4 skill buttons**.
   - Move to a skill button and press ✕ to equip a skill gem from your bag.
   - Move right onto a **socket** and press ✕ to put in a support. Only supports that fit that skill are offered. Choose "Remove" to take one out.
   - The right side explains the selected gem and what the whole skill now does.
5. **Skill gems level up** as you kill things while they're equipped: more damage, and more sockets (2 at first, then 3, 4 and 5). Supports socketed in a gem stay with it if you unequip it.
6. Skills: Frost Bolt, Fireball, Ice Nova, Earthsplitter, Fanning Shot, Magma Strike. Supports: Volley, Pierce, Chain, Fork, Shatter, Echo, Cast on Kill, Added Cold, Concentrated, Knockback, **Life Leech**, **Mana Leech**. (See the right side of the Inventory tab for what each does.)
7. **Dying** keeps everything you picked up and costs 10% of your current level's XP (you never lose a level). You retry the same zone.
8. Reach the glowing EXIT to clear the zone. Each cleared zone raises the monster level by 1.
9. **Menu → Debug** can give you any gem, switch weapon (Sword / Bow / Wand) or reset the character. Handy for trying combos without farming.

## Reading the screen

- Top left: life and mana bars, level, zone name and monster level, kills, timer, button hints.
- Bottom: skill bar (button, skill, mana cost; dim when you can't afford it) and the XP bar.
- Damage numbers: white = your hits, **yellow with "!" = critical**, red = damage you take, grey "evade" = dodged.
- Gems on the floor: teal name; the one you'd pick up is highlighted with the button to press. Teal squares on the minimap.
- Enemy status: **blue ring = chilled** (slowed), **solid icy disc = frozen** (can't move or attack), **flickering embers = burning**.
- Menu → Character tab: attributes, defences, and damage/speed/DPS for your weapon attack and each skill.

## New in this version

- **Cast on Kill aims for you:** the triggered skill's main shot now flies at the next nearest enemy instead of straight past it. Its follow-ups (Shatter shards, Fireball explosions) still spread normally.
- **New supports: Life Leech and Mana Leech.** A share of the damage you deal flows back as life or mana over time (up to 20% of your max per second). Gear will add leech too. The Character tab shows each skill's leech.
- New support gems drop like the others, or grab them from Menu → Debug.

## Extras

- `http://localhost:5173/?seed=303` loads a specific zone layout.
