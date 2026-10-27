// One place that turns keyboard/mouse and gamepad into game input:
//  - gameplay(): the sim's PlayerInput (move, aim, attack) from whichever device is active
//  - pressed(action): edge-triggered menu/UI actions, with key-repeat for directions
//  - device: "kbm" | "pad", so UI can show the right button prompts
// Scenes never read raw keys or pad buttons directly.

import Phaser from "phaser";
import type { Vec } from "../../sim/core/vec";
import type { PlayerInput } from "../../sim/world";
import { padAim } from "./aim";
import { isActive, isDown, leftStick, pickGamepad, PS_GLYPH, rightStick, snapshot, type PadButton, type PadSnapshot } from "./gamepad";

export type Device = "kbm" | "pad";

export type Action =
  | "confirm"
  | "cancel"
  | "inventory"
  | "character"
  | "dodge"
  | "pickup"
  | "up"
  | "down"
  | "left"
  | "right"
  | "tabPrev"
  | "tabNext"
  | "salvage"
  | "portal"
  | "zoom"
  | "passives";

interface Binding {
  keys: string[]; // Phaser key names
  pad: PadButton[];
  stick?: "up" | "down" | "left" | "right"; // left stick direction also triggers it
  repeat?: boolean; // auto-repeat while held (menu navigation)
  label: string; // keyboard prompt
}

const BINDINGS: Record<Action, Binding> = {
  confirm: { keys: ["ENTER", "SPACE"], pad: ["cross"], label: "Enter" },
  cancel: { keys: ["ESC"], pad: ["circle"], label: "Esc" },
  dodge: { keys: ["SPACE"], pad: ["circle"], label: "Space" },
  pickup: { keys: ["F"], pad: ["cross"], label: "F" },
  inventory: { keys: ["I"], pad: ["touchpad"], label: "I" }, // skills/loadout panel for now
  character: { keys: ["C"], pad: ["options"], label: "C" },
  up: { keys: ["W", "UP"], pad: ["up"], stick: "up", repeat: true, label: "W" },
  down: { keys: ["S", "DOWN"], pad: ["down"], stick: "down", repeat: true, label: "S" },
  left: { keys: ["A", "LEFT"], pad: ["left"], stick: "left", repeat: true, label: "A" },
  right: { keys: ["D", "RIGHT"], pad: ["right"], stick: "right", repeat: true, label: "D" },
  tabPrev: { keys: ["Q"], pad: ["l1"], label: "Q" },
  tabNext: { keys: ["TAB"], pad: ["r1"], label: "Tab" },
  salvage: { keys: ["X"], pad: ["square"], label: "X" }, // menus only (□ is a skill in gameplay)
  portal: { keys: ["T"], pad: ["up"], label: "T" }, // gameplay: D-pad up opens a portal to the hideout
  zoom: { keys: ["Z"], pad: ["triangle"], label: "Z" }, // passive tree zoom
  passives: { keys: ["P"], pad: [], label: "P" }, // straight to the passive tree
};

const ATTACK_PAD: PadButton[] = ["r2"];

/** Skill slots 1–4. Slot 1 on keyboard is the right mouse button (handled via the pointer). */
const SKILL_KEYS: (string | null)[] = [null, "Q", "E", "R"];
const SKILL_PAD: PadButton[] = ["r1", "square", "triangle", "l1"];
const MOVE_KEYS = { up: ["W", "UP"], down: ["S", "DOWN"], left: ["A", "LEFT"], right: ["D", "RIGHT"] };
const REPEAT_DELAY_MS = 350;
const REPEAT_RATE_MS = 110;
const STICK_MENU_THRESHOLD = 0.6;

export interface AimTargets {
  player: Vec;
  facing: number;
  enemies: readonly Vec[];
}

export class InputManager {
  device: Device = "kbm";
  padId: string | null = null;
  /** Called when the active device changes or a pad connects/disconnects. */
  onChange?: () => void;

  private keys = new Map<string, Phaser.Input.Keyboard.Key>();
  private pad: PadSnapshot | null = null;
  private held = new Map<Action, { since: number; lastFire: number }>();
  private fired = new Set<Action>();

  constructor(private scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    const names = new Set([
      ...Object.values(BINDINGS).flatMap((b) => b.keys),
      ...Object.values(MOVE_KEYS).flat(),
      ...SKILL_KEYS.filter((k): k is string => !!k),
    ]);
    for (const name of names) this.keys.set(name, kb.addKey(name));
    kb.on("keydown", () => this.setDevice("kbm"));
    scene.input.on("pointermove", () => this.setDevice("kbm"));
    scene.input.on("pointerdown", () => this.setDevice("kbm"));
    scene.input.mouse?.disableContextMenu();
  }

  /** Call once per frame before reading anything. */
  update(nowMs: number): void {
    const gp = pickGamepad(navigator.getGamepads?.() ?? []);
    this.pad = gp ? snapshot(gp) : null;
    const id = gp?.id ?? null;
    if (id !== this.padId) {
      this.padId = id;
      if (!id && this.device === "pad") this.device = "kbm";
      this.onChange?.();
    }
    if (this.pad && isActive(this.pad)) this.setDevice("pad");

    this.fired.clear();
    for (const action of Object.keys(BINDINGS) as Action[]) {
      // JustDown also catches a tap that went down and up between two frames.
      const tapped = BINDINGS[action].keys.some((n) => {
        const key = this.keys.get(n);
        return !!key && Phaser.Input.Keyboard.JustDown(key);
      });
      if (tapped && !this.held.has(action)) this.fired.add(action);
      const down = this.actionDown(action);
      const state = this.held.get(action);
      if (!down) {
        this.held.delete(action);
        continue;
      }
      if (!state) {
        this.held.set(action, { since: nowMs, lastFire: nowMs });
        this.fired.add(action);
      } else if (BINDINGS[action].repeat && nowMs - state.since >= REPEAT_DELAY_MS && nowMs - state.lastFire >= REPEAT_RATE_MS) {
        state.lastFire = nowMs;
        this.fired.add(action);
      }
    }
  }

  /** True on the frame an action is pressed (and on repeats for menu directions). */
  pressed(action: Action): boolean {
    return this.fired.has(action);
  }

  /** Short prompt for an action on the current device, e.g. "E" or "✕". */
  prompt(action: Action): string {
    const b = BINDINGS[action];
    if (this.device === "pad") return b.pad.map((p) => PS_GLYPH[p] ?? p).join("/");
    return b.label;
  }

  /** Movement, aim, attack, skills and dodge for the sim. */
  gameplay(targets: AimTargets, pointerWorld: Vec, mouse: { left: boolean; right: boolean }): PlayerInput {
    const dodge = this.pressed("dodge");
    const pickup = this.pressed("pickup");
    const portal = this.pressed("portal");
    if (this.device === "pad" && this.pad) {
      const pad = this.pad;
      const move = leftStick(pad);
      const aim = padAim({ ...targets, move, rightStick: rightStick(pad) });
      const skills = SKILL_PAD.map((b) => isDown(pad, b));
      return { move, aim, attack: ATTACK_PAD.some((b) => isDown(pad, b)), skills, dodge, pickup, portal };
    }
    const k = (names: string[]) => names.some((n) => this.keys.get(n)?.isDown);
    const x = (k(MOVE_KEYS.right) ? 1 : 0) - (k(MOVE_KEYS.left) ? 1 : 0);
    const y = (k(MOVE_KEYS.down) ? 1 : 0) - (k(MOVE_KEYS.up) ? 1 : 0);
    const skills = SKILL_KEYS.map((key) => (key ? k([key]) : mouse.right));
    return { move: { x, y }, aim: pointerWorld, attack: mouse.left, skills, dodge, pickup, portal };
  }

  /** Button prompt for skill slot i (0-based) on the current device. */
  skillPrompt(i: number): string {
    if (this.device === "pad") return PS_GLYPH[SKILL_PAD[i]!] ?? SKILL_PAD[i]!;
    return SKILL_KEYS[i] ?? "RMB";
  }

  /** Rumble the pad if the browser supports it (Chrome/Edge do for DualSense and Xbox pads). */
  rumble(strong: number, weak: number, ms: number): void {
    if (this.device !== "pad") return;
    const gp = pickGamepad(navigator.getGamepads?.() ?? []);
    const actuator = (gp as (Gamepad & { vibrationActuator?: GamepadHapticActuator }) | null)?.vibrationActuator;
    actuator?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }

  private actionDown(action: Action): boolean {
    const b = BINDINGS[action];
    if (b.keys.some((n) => this.keys.get(n)?.isDown)) return true;
    if (!this.pad) return false;
    if (b.pad.some((p) => isDown(this.pad!, p))) return true;
    if (b.stick) {
      const s = leftStick(this.pad);
      const t = STICK_MENU_THRESHOLD;
      return (b.stick === "up" && s.y < -t) || (b.stick === "down" && s.y > t) || (b.stick === "left" && s.x < -t) || (b.stick === "right" && s.x > t);
    }
    return false;
  }

  private setDevice(d: Device): void {
    if (this.device === d) return;
    this.device = d;
    this.onChange?.();
  }
}
