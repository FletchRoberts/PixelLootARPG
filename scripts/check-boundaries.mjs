// Fails if simulation/data code imports rendering or input code.
// src/sim and src/data must stay runnable headless (e.g. on a multiplayer host).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/sim", "src/data"];
const FORBIDDEN = [/^phaser/, /\/client\//, /^\.\.?\/.*client/];
const IMPORT_RE = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(p) ? [p] : [];
  });

let failed = false;
for (const file of ROOTS.flatMap(files)) {
  for (const m of readFileSync(file, "utf8").matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (FORBIDDEN.some((re) => re.test(spec))) {
      console.error(`${file}: forbidden import "${spec}" (sim/data must not depend on rendering)`);
      failed = true;
    }
  }
}
process.exit(failed ? 1 : 0);
