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

## Controls

| Action | Keyboard + mouse | PS5 controller |
|---|---|---|
| Move | WASD / arrows | Left stick |
| Aim | Mouse | Right stick (else aim assist picks the nearest enemy) |
| Attack | Hold left click | Hold R2 or □ |
| Next zone / retry | E, Enter, Space or click | ✕ |

Controller: plug it in, open the page, press any button. A "Controller connected" message appears.

## What to do

1. Follow the winding path; the minimap (top right) shows you (white), the exit (blue) and monsters (red, brighter when awake).
2. Husk packs sleep until you get close, then the whole pack chases you. They hurt on contact; there's no healing yet.
3. Reach the glowing EXIT in the end arena to clear the zone, then press confirm for a new zone.
4. If you die, confirm retries the same zone.

## Extras

- `http://localhost:5173/?seed=303` loads a specific zone layout.
