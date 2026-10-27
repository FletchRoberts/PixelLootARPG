// Passive tree view, shown in the menu's Passives tab. Draws the tree (links and nodes,
// clipped to the panel by hand: no masks, so it works with the fixed-to-camera menu),
// follows the selected node, and shows the node's stats plus the green/red change to the
// character if you allocate (or refund) it. Pad-first: D-pad jumps to the nearest node in
// that direction, ✕ allocates, □ refunds, △ zooms.

import Phaser from "phaser";
import { content } from "../../data";
import type { PassiveNodeDef } from "../../sim/data/types";
import { compareWorlds, type StatChange } from "../../sim/items/compare";
import { modifierText } from "../../sim/items/gear";
import { allocateProblem, passiveNode, pointsLeft, refundCost, refundProblem, totalPoints } from "../../sim/passives/tree";
import type { InventoryCommand, WorldState } from "../../sim/world";
import type { InputManager } from "../input/InputManager";

const tree = content.passiveTree;
const FONT = { fontFamily: "monospace", fontSize: "12px", color: "#d8d8e0" };
const ZOOMS = [0.32, 0.55, 0.85];
const NODE_R = { start: 13, small: 6, notable: 11, keystone: 16 } as const;
const COLORS = {
  link: 0x3a3a4a,
  linkOn: 0xd8b04a,
  small: 0x6a6a7a,
  notable: 0x8a7a4a,
  keystone: 0x7a4a9a,
  on: 0xffd86a,
  keystoneOn: 0xd88aff,
  reachable: 0xe8e8f0,
  cursor: 0x6fd3ff,
};

export interface TreeActions {
  command(cmd: InventoryCommand): string | null;
  preview(cmd: InventoryCommand): WorldState | string;
}

export class PassiveTreeView {
  selected = tree.start;
  private zoom = 1; // index into ZOOMS
  private cam = { x: 0, y: 0 }; // tree-space point at the panel centre
  private message = "";
  private g: Phaser.GameObjects.Graphics;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private above = new Set<string>(); // labels drawn above their node (a neighbour's label takes the space below)
  private info: Phaser.GameObjects.Text;
  private diff: Phaser.GameObjects.Text[] = [];
  private diffCache: { key: string; title: string; changes: StatChange[] } | null = null;
  readonly objects: Phaser.GameObjects.GameObject[];

  constructor(
    scene: Phaser.Scene,
    private inputs: InputManager,
    private world: () => WorldState,
    private actions: TreeActions,
  ) {
    this.g = scene.add.graphics();
    for (const n of tree.nodes) {
      if (n.kind === "notable" || n.kind === "keystone") {
        this.labels.set(n.id, scene.add.text(0, 0, n.name, { ...FONT, fontSize: n.kind === "keystone" ? "13px" : "11px", color: n.kind === "keystone" ? "#d8a0ff" : "#e8d8a0", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5, 0));
      }
    }
    // Two labelled nodes side by side (wheels with two notables): put the second label above.
    const labelled = tree.nodes.filter((n) => this.labels.has(n.id));
    for (const n of labelled) {
      if (labelled.some((o) => o.id < n.id && Math.hypot(o.x - n.x, o.y - n.y) < 120)) this.above.add(n.id);
    }
    this.info = scene.add.text(0, 0, "", { ...FONT, fontSize: "13px", lineSpacing: 3 });
    for (let i = 0; i < 12; i++) this.diff.push(scene.add.text(0, 0, "", FONT));
    this.objects = [this.g, ...this.labels.values(), this.info, ...this.diff];
  }

  setVisible(v: boolean): void {
    for (const o of this.objects) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(v);
  }

  private owned(): Set<string> {
    return new Set([tree.start, ...this.world().player.save.passives]);
  }

  /** The nearest node roughly in direction (dx, dy) from the selected one. */
  private step(dx: number, dy: number): void {
    const from = passiveNode(tree, this.selected)!;
    let best: PassiveNodeDef | null = null;
    let bestScore = Infinity;
    for (const n of tree.nodes) {
      if (n.id === from.id) continue;
      const vx = n.x - from.x;
      const vy = n.y - from.y;
      const d = Math.hypot(vx, vy);
      const cos = (vx * dx + vy * dy) / d;
      if (cos < 0.5) continue; // within ±60°
      const linked = from.links.includes(n.id) ? 0.6 : 1; // prefer following a link
      const score = d * (2 - cos) * linked;
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    if (best) {
      this.selected = best.id;
      this.message = "";
    }
  }

  update(): void {
    const i = this.inputs;
    if (i.pressed("up")) this.step(0, -1);
    if (i.pressed("down")) this.step(0, 1);
    if (i.pressed("left")) this.step(-1, 0);
    if (i.pressed("right")) this.step(1, 0);
    if (i.pressed("zoom")) this.zoom = (this.zoom + 1) % ZOOMS.length;
    if (i.pressed("confirm")) {
      const refused = this.actions.command({ type: "passive_allocate", node: this.selected });
      this.message = refused ? `Can't: ${refused}` : `Allocated ${passiveNode(tree, this.selected)!.name}`;
      this.diffCache = null;
    }
    if (i.pressed("salvage")) {
      const refused = this.actions.command({ type: "passive_refund", node: this.selected });
      this.message = refused ? `Can't refund: ${refused}` : `Refunded ${passiveNode(tree, this.selected)!.name}`;
      this.diffCache = null;
    }
  }

  /** Stat changes if the selected node were allocated (or refunded, if it's allocated). Cached. */
  private changes(): { title: string; changes: StatChange[] } | null {
    const w = this.world();
    const owned = this.owned();
    if (this.selected === tree.start) return null;
    const on = owned.has(this.selected);
    const key = `${this.selected}:${w.player.save.passives.join(",")}:${w.player.level}`;
    if (this.diffCache?.key === key) return this.diffCache;
    const after = this.actions.preview({ type: on ? "passive_refund" : "passive_allocate", node: this.selected });
    this.diffCache = {
      key,
      title: typeof after === "string" ? "" : on ? "If refunded:" : "If allocated:",
      changes: typeof after === "string" ? [] : compareWorlds(w, after, content),
    };
    return this.diffCache;
  }

  render(x: number, y: number, w: number, h: number): void {
    const world = this.world();
    const save = world.player.save;
    const owned = this.owned();
    const level = world.player.level;
    const panelW = Math.min(360, w * 0.36);
    const treeW = w - panelW - 12;
    const z = ZOOMS[this.zoom]!;
    // Follow the selection smoothly.
    const sel = passiveNode(tree, this.selected)!;
    this.cam.x += (sel.x - this.cam.x) * 0.25;
    this.cam.y += (sel.y - this.cam.y) * 0.25;
    const cx = x + treeW / 2;
    const cy = y + h / 2;
    const sx = (n: { x: number }) => cx + (n.x - this.cam.x) * z;
    const sy = (n: { y: number }) => cy + (n.y - this.cam.y) * z;
    const inside = (px: number, py: number, pad = 0) => px >= x - pad && px <= x + treeW + pad && py >= y - pad && py <= y + h + pad;

    const g = this.g.clear();
    g.fillStyle(0x08080c, 0.9).fillRect(x, y, treeW, h);
    g.lineStyle(1, 0x2a2a38, 1).strokeRect(x, y, treeW, h);
    // Links (clipped to the panel).
    for (const n of tree.nodes) {
      for (const l of n.links) {
        if (l < n.id) continue;
        const m = passiveNode(tree, l)!;
        const seg = clip(sx(n), sy(n), sx(m), sy(m), x, y, x + treeW, y + h);
        if (!seg) continue;
        const on = owned.has(n.id) && owned.has(l);
        g.lineStyle(on ? 3 : 2, on ? COLORS.linkOn : COLORS.link, on ? 1 : 0.8).lineBetween(seg[0], seg[1], seg[2], seg[3]);
      }
    }
    // Nodes.
    for (const n of tree.nodes) {
      const px = sx(n);
      const py = sy(n);
      const r = NODE_R[n.kind] * Math.max(0.7, z * 1.4);
      const label = this.labels.get(n.id);
      if (!inside(px, py, -r)) {
        label?.setVisible(false);
        continue;
      }
      const on = owned.has(n.id);
      const reachable = !on && n.links.some((l) => owned.has(l));
      const base = n.kind === "keystone" ? COLORS.keystone : n.kind === "notable" ? COLORS.notable : n.kind === "start" ? COLORS.cursor : COLORS.small;
      const fill = on ? (n.kind === "keystone" ? COLORS.keystoneOn : COLORS.on) : base;
      g.fillStyle(fill, on || n.kind !== "small" ? 1 : 0.85).fillCircle(px, py, r);
      if (reachable) g.lineStyle(2, COLORS.reachable, 0.9).strokeCircle(px, py, r + 2);
      if (n.id === this.selected) g.lineStyle(3, COLORS.cursor, 1).strokeCircle(px, py, r + 6);
      const up = this.above.has(n.id);
      label?.setVisible(z >= 0.5 || n.kind === "keystone").setOrigin(0.5, up ? 1 : 0).setPosition(px, up ? py - r - 3 : py + r + 3);
    }

    // Side panel: points, selected node, change preview.
    const ix = x + treeW + 12;
    const left = pointsLeft(save, level, content.progression);
    const lines: string[] = [
      `PASSIVE POINTS: ${left} unspent  (${save.passives.length} / ${totalPoints(level, content.progression)})`,
      "",
      `${sel.name}${sel.kind === "small" ? "" : `  (${sel.kind})`}`,
    ];
    if (sel.kind === "keystone") lines.push(...(sel.text ?? []).map((t) => `  ${t}`));
    else if (sel.kind !== "small") lines.push(...sel.stats.map((m) => `  ${modifierText(m)}`));
    else if (sel.stats.length > 1) lines.push(...sel.stats.map((m) => `  ${modifierText(m)}`));
    lines.push("");
    const on = owned.has(sel.id);
    if (sel.id === tree.start) lines.push("Your starting point.");
    else if (on) {
      const cost = refundCost(level, content.progression);
      const why = refundProblem(save, content, sel.id);
      lines.push("Allocated.", why ? `Can't refund: ${why}` : `${this.inputs.prompt("salvage")} refund${cost ? ` (1 Lethe Ash, you have ${save.currency[cost.currency] ?? 0})` : " (free below level " + content.progression.passives.freeRefundsBelowLevel + ")"}`);
    } else {
      const why = allocateProblem(save, level, content, sel.id);
      lines.push(why ? `Can't allocate: ${why}` : `${this.inputs.prompt("confirm")} allocate`);
    }
    if (this.message) lines.push("", this.message);
    this.info.setPosition(ix, y).setWordWrapWidth(panelW).setText(lines);

    const diff = this.changes();
    const rows: { text: string; color: string }[] = [];
    if (diff?.title) {
      rows.push({ text: diff.title, color: "#d8d8e0" });
      if (diff.changes.length === 0) rows.push({ text: "  no change to your stats", color: "#8a8a96" });
      const n = (v: number) => (Math.abs(v) < 10 && !Number.isInteger(v) ? v.toFixed(1) : String(Math.round(v)));
      for (const c of diff.changes.slice(0, this.diff.length - 1)) {
        const pct = c.percent ? "%" : "";
        rows.push({ text: `  ${c.delta > 0 ? "+" : "−"}${n(Math.abs(c.delta))}${pct} ${c.label}`, color: c.better ? "#6ee07a" : "#ff6a6a" });
      }
    }
    const dy = y + this.info.height + 12;
    this.diff.forEach((t, k) => t.setPosition(ix, dy + k * 16).setText(rows[k]?.text ?? "").setColor(rows[k]?.color ?? "#d8d8e0"));
  }
}

/** Liang–Barsky: the part of segment (x0,y0)-(x1,y1) inside the rectangle, or null. */
function clip(x0: number, y0: number, x1: number, y1: number, minX: number, minY: number, maxX: number, maxY: number): [number, number, number, number] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, x0 - minX],
    [dx, maxX - x0],
    [-dy, y0 - minY],
    [dy, maxY - y0],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}
