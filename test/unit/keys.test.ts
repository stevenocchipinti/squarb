import { describe, expect, it } from "vitest";
import { KeySequencer } from "../../src/content/keys";
import { DEFAULT_SETTINGS, findConflicts, normalizeSettings } from "../../src/shared/settings";

const ctx = { highlightMode: false, hasCursor: false, hasUi: false };

function seq() {
  let t = 0;
  const s = new KeySequencer(structuredClone(DEFAULT_SETTINGS), () => t);
  return { s, advance: (ms: number) => (t += ms) };
}

describe("KeySequencer", () => {
  it("]b and [b", () => {
    const { s } = seq();
    expect(s.feed("]", ctx)).toEqual({ type: "pending", prefix: "]" });
    expect(s.feed("b", ctx)).toEqual({ type: "jump", target: "button", dir: 1 });
    s.feed("[", ctx);
    expect(s.feed("b", ctx)).toEqual({ type: "jump", target: "button", dir: -1 });
  });

  it("digits jump to heading levels; f is an alias for j", () => {
    const { s } = seq();
    s.feed("]", ctx);
    expect(s.feed("3", ctx)).toEqual({ type: "jump", target: "heading3", dir: 1 });
    s.feed("]", ctx);
    expect(s.feed("f", ctx)).toEqual({ type: "jump", target: "formControl", dir: 1 });
  });

  it("]] and [[ repeat", () => {
    const { s } = seq();
    s.feed("]", ctx);
    expect(s.feed("]", ctx)).toEqual({ type: "repeat", dir: 1 });
    s.feed("[", ctx);
    expect(s.feed("[", ctx)).toEqual({ type: "repeat", dir: -1 });
  });

  it("\\ + key highlights, \\\\ opens the rotor", () => {
    const { s } = seq();
    s.feed("\\", ctx);
    expect(s.feed("b", ctx)).toEqual({ type: "highlightAll", target: "button" });
    s.feed("\\", ctx);
    expect(s.feed("\\", ctx)).toEqual({ type: "rotor" });
  });

  it("bare brackets step in highlight mode", () => {
    const { s } = seq();
    expect(s.feed("]", { ...ctx, highlightMode: true })).toEqual({ type: "step", dir: 1 });
    expect(s.feed("[", { ...ctx, highlightMode: true })).toEqual({ type: "step", dir: -1 });
  });

  it("times out a pending prefix", () => {
    const { s, advance } = seq();
    s.feed("]", ctx);
    advance(1500);
    expect(s.feed("b", ctx)).toBeNull();
  });

  it("ignores modifier keydowns while pending (Shift for ?)", () => {
    const { s } = seq();
    s.feed("]", ctx);
    expect(s.feed("Shift", ctx)?.type).toBe("pending");
    expect(s.feed("h", ctx)).toEqual({ type: "jump", target: "heading", dir: 1 });
  });

  it("reports unbound sequences, and passes through everything else", () => {
    const { s } = seq();
    s.feed("]", ctx);
    expect(s.feed("q", ctx)).toEqual({ type: "unbound", sequence: "]q" });
    expect(s.feed("q", ctx)).toBeNull();
    expect(s.feed("Enter", ctx)).toBeNull();
    expect(s.feed("Enter", { ...ctx, hasCursor: true })).toEqual({ type: "enter" });
    expect(s.feed("Escape", ctx)).toBeNull();
    expect(s.feed("Escape", { ...ctx, hasUi: true })).toEqual({ type: "escape" });
    expect(s.feed("?", ctx)).toEqual({ type: "help" });
  });

  it("uses remapped keys", () => {
    const settings = normalizeSettings({ nextKey: "'", targetKeys: { button: ["u"] } });
    const s = new KeySequencer(settings);
    s.feed("'", ctx);
    expect(s.feed("u", ctx)).toEqual({ type: "jump", target: "button", dir: 1 });
  });
});

describe("settings", () => {
  it("defaults have no conflicts", () => {
    expect(findConflicts(DEFAULT_SETTINGS)).toEqual([]);
  });
  it("detects conflicts", () => {
    const s = normalizeSettings({ targetKeys: { link: ["b"] } });
    expect(findConflicts(s)).toEqual([{ key: "b", owners: ["buttons", "links"] }]);
  });
  it("ignores junk in storage", () => {
    const s = normalizeSettings({ nextKey: "too long", sequenceTimeoutMs: 1, targetKeys: { button: [1, "x"] } });
    expect(s.nextKey).toBe("]");
    expect(s.sequenceTimeoutMs).toBe(1000);
    expect(s.targetKeys.button).toEqual(["x"]);
  });
});
