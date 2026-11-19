import { buildKeyLookup, type Settings } from "../shared/settings";
import type { TargetId } from "../shared/targets";

export type Dir = 1 | -1;

export type Action =
  | { type: "jump"; target: TargetId; dir: Dir }
  | { type: "repeat"; dir: Dir }
  | { type: "highlightAll"; target: TargetId }
  | { type: "step"; dir: Dir }
  | { type: "rotor" }
  | { type: "help" }
  | { type: "enter" }
  | { type: "escape" }
  | { type: "pending"; prefix: string }
  | { type: "unbound"; sequence: string };

export interface KeyContext {
  /** Highlight-all mode is on: bare ] / [ step through the matches. */
  highlightMode: boolean;
  /** There's a current highlight that Enter can commit. */
  hasCursor: boolean;
  /** Something of ours is showing that Esc should close. */
  hasUi: boolean;
}

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph", "Fn", "OS"]);

/**
 * Turns single key presses into actions. Knows nothing about the DOM; the
 * caller decides what's editable and whether to consume the event.
 * Returns null for "not ours, let the page have it".
 */
export class KeySequencer {
  private pending: { prefix: "next" | "prev" | "highlight"; at: number } | null = null;
  private lookup: Map<string, TargetId>;

  constructor(
    private settings: Settings,
    private now: () => number = () => Date.now(),
  ) {
    this.lookup = buildKeyLookup(settings);
  }

  setSettings(s: Settings): void {
    this.settings = s;
    this.lookup = buildKeyLookup(s);
    this.pending = null;
  }

  get isPending(): boolean {
    this.expire();
    return this.pending !== null;
  }

  reset(): void {
    this.pending = null;
  }

  private expire(): void {
    if (this.pending && this.now() - this.pending.at > this.settings.sequenceTimeoutMs) this.pending = null;
  }

  private target(key: string): TargetId | undefined {
    return this.lookup.get(key) ?? this.lookup.get(key.toLowerCase());
  }

  feed(key: string, ctx: KeyContext): Action | null {
    if (MODIFIER_KEYS.has(key)) return this.pending ? { type: "pending", prefix: this.prefixChar() } : null;
    this.expire();
    const s = this.settings;

    if (this.pending) {
      const p = this.pending.prefix;
      this.pending = null;
      if (key === "Escape") return { type: "escape" };
      if (p === "next" && key === s.nextKey) return { type: "repeat", dir: 1 };
      if (p === "prev" && key === s.prevKey) return { type: "repeat", dir: -1 };
      if (p === "highlight" && key === s.highlightKey) return { type: "rotor" };
      const t = this.target(key);
      if (t) {
        if (p === "highlight") return { type: "highlightAll", target: t };
        return { type: "jump", target: t, dir: p === "next" ? 1 : -1 };
      }
      return { type: "unbound", sequence: this.charFor(p) + key };
    }

    if (key === s.nextKey || key === s.prevKey) {
      const dir: Dir = key === s.nextKey ? 1 : -1;
      // In highlight mode a bare bracket steps straight away.
      if (ctx.highlightMode) return { type: "step", dir };
      this.pending = { prefix: dir === 1 ? "next" : "prev", at: this.now() };
      return { type: "pending", prefix: key };
    }
    if (key === s.highlightKey) {
      this.pending = { prefix: "highlight", at: this.now() };
      return { type: "pending", prefix: key };
    }
    if (key === s.helpKey) return { type: "help" };
    if (key === "Enter" && ctx.hasCursor) return { type: "enter" };
    if (key === "Escape" && (ctx.hasUi || ctx.hasCursor || ctx.highlightMode)) return { type: "escape" };
    return null;
  }

  private prefixChar(): string {
    return this.pending ? this.charFor(this.pending.prefix) : "";
  }

  private charFor(p: "next" | "prev" | "highlight"): string {
    return p === "next" ? this.settings.nextKey : p === "prev" ? this.settings.prevKey : this.settings.highlightKey;
  }
}
