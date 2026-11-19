import { DEFAULT_SETTINGS, type Settings } from "../shared/settings";
import { NAME_REQUIRED_ROLES, TARGET_BY_ID, type TargetId } from "../shared/targets";
import { entryMatches, isNavigable, RoleIndex, topModal, type Entry } from "./a11y/index";
import { collectIssues, roleLabel, runHandlerProbe, scanClickables, suspectMessage, type Suspect } from "./a11y/lint";
import { accessibleName, displayName, truncate } from "./a11y/names";
import { computeRole, elementStates, headingLevel, isContentEditable } from "./a11y/roles";
import { compareFlat, deepActiveElement, flatContains } from "./a11y/tree";
import { isRendered, isVisuallyHidden, viewportRect, visibleAnchor } from "./a11y/visibility";
import { KeySequencer, type Action, type Dir } from "./keys";
import { Help } from "./ui/help";
import { Overlay, type LabelInfo } from "./ui/overlay";
import { Rotor, type RotorItem } from "./ui/rotor";

const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "image", "range", "color", "file", "hidden"]);
const EDITABLE_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);
/** Jumps that flash "looks clickable" elements they skip over. */
const WARN_ON: ReadonlySet<TargetId> = new Set(["button", "link", "formControl", "textField", "comboBox", "radio"]);

export function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (isContentEditable(el)) return true;
  const ln = el.localName;
  if (ln === "textarea" || ln === "select") return true;
  if (ln === "input") return !NON_TEXT_INPUTS.has((el as HTMLInputElement).type);
  const role = el.getAttribute("role")?.trim().split(/\s+/)[0];
  return !!role && EDITABLE_ROLES.has(role);
}

export interface Platform {
  openOptions(): void;
  openExplainer(anchor?: string): void;
}

const ROTOR_GROUPS: { id: string; label: string; target?: TargetId }[] = [
  { id: "headings", label: "Headings", target: "heading" },
  { id: "links", label: "Links", target: "link" },
  { id: "buttons", label: "Buttons", target: "button" },
  { id: "forms", label: "Form controls", target: "formControl" },
  { id: "landmarks", label: "Landmarks", target: "landmark" },
  { id: "tables", label: "Tables", target: "table" },
  { id: "images", label: "Images", target: "graphic" },
  { id: "issues", label: "Issues" },
];

export class Controller {
  private settings: Settings = structuredClone(DEFAULT_SETTINGS);
  private seq: KeySequencer;
  private _index: RoleIndex | null = null;
  private _overlay: Overlay | null = null;
  private rotor: Rotor | null = null;
  private help: Help | null = null;
  private cursor: Element | null = null;
  /** Where the user last clicked or tabbed to; next jump starts there. */
  private startHint: Element | null = null;
  private last: { target: TargetId; dir: Dir; loose: boolean } | null = null;
  private mode: { target: TargetId; loose: boolean } | null = null;
  /** Set when the cursor is on something that only looks clickable. */
  private cursorSuspect: Suspect | null = null;
  private selfClick = false;
  private suspects: Suspect[] = [];
  private suspectsStale = true;
  private scanTimer = 0;
  private pendingTimer = 0;
  private swallowed = new Set<string>();
  private selfFocus = false;
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  private windows = new WeakSet<Window>();
  private warmed = false;

  constructor(
    private doc: Document,
    private platform: Platform,
  ) {
    this.seq = new KeySequencer(this.settings);
    this.listen(doc.defaultView!);
  }

  setSettings(s: Settings): void {
    this.settings = s;
    this.seq.setSettings(s);
  }

  // ---------------------------------------------------------------- lazy parts

  get index(): RoleIndex {
    if (!this._index) {
      this._index = new RoleIndex({
        root: this.doc,
        onFrameDocument: (d) => {
          if (d.defaultView) {
            this.listen(d.defaultView);
            this._overlay?.watchWindow(d.defaultView);
          }
        },
        onMutation: () => this.scheduleSuspectScan(),
      });
    }
    return this._index;
  }

  get overlay(): Overlay {
    if (!this._overlay) {
      this._overlay = new Overlay(this.doc);
      this.rotor = new Rotor(
        this._overlay,
        { groups: ROTOR_GROUPS, items: (id) => this.rotorItems(id) },
        (item) => this.chooseRotorItem(item),
      );
      this.help = new Help(this._overlay, this.platform);
    }
    return this._overlay;
  }

  // ---------------------------------------------------------------- events

  private listen(win: Window): void {
    if (this.windows.has(win)) return;
    this.windows.add(win);
    win.addEventListener("keydown", (e) => this.onKeyDown(e), true);
    // If we ate the keydown, eat its keypress/keyup too so page shortcuts
    // bound to those don't fire.
    const eat = (e: KeyboardEvent) => {
      if (this.swallowed.has(e.code || e.key)) {
        if (e.type === "keyup") this.swallowed.delete(e.code || e.key);
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    win.addEventListener("keypress", eat, true);
    win.addEventListener("keyup", eat, true);
    win.addEventListener(
      "pointerdown",
      (e) => {
        if (this.selfClick || this._overlay?.isOwnEvent(e)) return;
        const t = e.composedPath()[0];
        if (t instanceof (win as typeof window).Element || (t as Node)?.nodeType === 1) {
          this.startHint = t as Element;
          if (this.cursor) this.clearCursor();
        }
      },
      true,
    );
    win.addEventListener(
      "focusin",
      (e) => {
        if (this.selfFocus || this._overlay?.isOwnEvent(e)) return;
        const t = deepActiveElement(this.doc);
        if (t && t !== this.cursor && t !== this.doc.body) {
          this.startHint = t;
          if (this.cursor) this.clearCursor();
        }
      },
      true,
    );
  }

  private consume(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopImmediatePropagation();
    this.swallowed.add(e.code || e.key);
  }

  onKeyDown(e: KeyboardEvent): void {
    // Keys typed into our own rotor/help: keep page shortcuts away from them,
    // but let default actions (typing in the filter box) happen.
    if (this._overlay?.isOwnEvent(e)) {
      e.stopImmediatePropagation();
      if (this.rotor?.isOpen && this.rotor.handleKey(e)) e.preventDefault();
      else if (this.help?.isOpen && this.help.handleKey(e, this.settings)) e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.key === "Process") return;

    if (this.help?.isOpen && (e.key === "Escape" || e.key === this.settings.helpKey)) {
      this.consume(e);
      this.help.close();
      return;
    }

    const active = deepActiveElement(this.doc);
    if (isEditable(active)) {
      this.seq.reset();
      if (e.key === "Escape") {
        // Let the page handle Esc first (closing an autocomplete, say);
        // only leave the field if nobody else did anything with it.
        setTimeout(() => {
          if (!e.defaultPrevented && deepActiveElement(this.doc) === active) (active as HTMLElement).blur();
        }, 0);
      }
      return;
    }

    const action = this.seq.feed(e.key, {
      highlightMode: !!this.mode,
      hasCursor: !!this.cursor?.isConnected,
      hasUi: !!this._overlay?.hasUi,
    });
    if (!action) return;
    if (action.type === "enter" && !this.enter()) return;
    this.consume(e);
    if (!this.warmed) {
      this.warmed = true;
      this.warmUp();
    }
    this.run(action);
  }

  // ---------------------------------------------------------------- actions

  run(action: Action): void {
    if (action.type !== "pending") this.showPending(null);
    switch (action.type) {
      case "pending":
        this.showPending(action.prefix);
        break;
      case "jump": {
        const loose = !!action.loose;
        this.last = { target: action.target, dir: action.dir, loose };
        this.jump(action.target, action.dir, loose);
        break;
      }
      case "repeat":
        if (this.last) this.jump(this.last.target, action.dir, this.last.loose);
        else this.overlay.toast(hint("Nothing to repeat yet. Try ", this.settings.nextKey + "h", " first."));
        break;
      case "step":
        if (this.mode) this.jump(this.mode.target, action.dir, this.mode.loose);
        break;
      case "highlightAll":
        this.highlightAll(action.target, !!action.loose);
        break;
      case "rotor":
        this.openRotor();
        break;
      case "help":
        void this.overlay;
        this.help!.toggle(this.settings);
        break;
      case "enter":
        break; // handled before consume
      case "escape":
        this.clearAll();
        break;
      case "unbound":
        this.overlay.toast(hint("", action.sequence, " isn't bound to anything. Press ", this.settings.helpKey, " for keys."));
        break;
    }
  }

  private showPending(prefix: string | null): void {
    clearTimeout(this.pendingTimer);
    if (!prefix) {
      this._overlay?.showPending(null);
      return;
    }
    this.overlay.showPending(prefix);
    this.pendingTimer = window.setTimeout(() => this._overlay?.showPending(null), this.settings.sequenceTimeoutMs);
  }

  clearAll(): void {
    this.mode = null;
    this.clearCursor();
    this.rotor?.close();
    this.help?.close();
    this._overlay?.clearAll();
    this._overlay?.clearWarnings();
  }

  private clearCursor(): void {
    this.cursor = null;
    this.cursorSuspect = null;
    this._overlay?.clearCurrent();
  }

  // ---------------------------------------------------------------- jumping

  private startPoint(): Element | null {
    if (this.cursor?.isConnected) return this.cursor;
    if (this.startHint?.isConnected) return this.startHint;
    const a = deepActiveElement(this.doc);
    if (a && a !== this.doc.body && a !== this.doc.documentElement) return a;
    return null;
  }

  /** Find the next/previous match. Exposed for tests and the benchmark. */
  findNext(target: TargetId, dir: Dir, from: Element | null, loose = false): { entry: Entry; wrapped: boolean } | null {
    if (loose) return this.findNextLoose(target, dir, from);
    const entries = this.index.all();
    const modal = topModal(this.doc);
    const ok = (e: Entry) => entryMatches(e, target) && isNavigable(e, modal);
    const n = entries.length;

    if (!from) {
      // Nothing selected: start from the top of the viewport.
      if (dir === 1) {
        let first: Entry | null = null;
        for (const e of entries) {
          if (!ok(e)) continue;
          first ??= e;
          const r = viewportRect(isVisuallyHidden(e.el) ? visibleAnchor(e.el) : e.el);
          if (r.top >= 0) return { entry: e, wrapped: false };
        }
        return first ? { entry: first, wrapped: true } : null;
      }
      let last: Entry | null = null;
      for (let i = n - 1; i >= 0; i--) {
        const e = entries[i]!;
        if (!ok(e)) continue;
        last ??= e;
        const r = viewportRect(e.el);
        if (r.top < 0) return { entry: e, wrapped: false };
      }
      return last ? { entry: last, wrapped: true } : null;
    }

    const pos = this.index.positionOf(from);
    const isEntry = entries[pos]?.el === from;
    if (dir === 1) {
      const begin = isEntry ? pos + 1 : pos;
      for (let i = begin; i < n; i++) if (ok(entries[i]!)) return { entry: entries[i]!, wrapped: false };
      for (let i = 0; i < Math.min(begin, n); i++) if (ok(entries[i]!)) return { entry: entries[i]!, wrapped: true };
    } else {
      for (let i = pos - 1; i >= 0; i--) if (ok(entries[i]!)) return { entry: entries[i]!, wrapped: false };
      for (let i = n - 1; i >= pos; i--) if (ok(entries[i]!)) return { entry: entries[i]!, wrapped: true };
    }
    return null;
  }

  /**
   * Loose mode (]B, ]L): real matches and look-alike clickables together, in
   * page order, so stepping never loses your place among the real ones.
   */
  private looseCandidates(target: TargetId): { el: Element; entry?: Entry; suspect?: Suspect }[] {
    const modal = topModal(this.doc);
    const real: { el: Element; entry?: Entry; suspect?: Suspect }[] = this.matchesFor(target).map((entry) => ({ el: entry.el, entry }));
    const fakes = this.ensureSuspects()
      .filter((s) => s.el.isConnected && (!modal || flatContains(modal, s.el)) && isRendered(s.el))
      .map((suspect) => ({ el: suspect.el, suspect }));
    if (!fakes.length) return real;
    return [...real, ...fakes].sort((a, b) => compareFlat(a.el, b.el));
  }

  private findNextLoose(target: TargetId, dir: Dir, from: Element | null): { entry: Entry; wrapped: boolean } | null {
    const list = this.looseCandidates(target);
    if (!list.length) return null;
    const asEntry = (c: (typeof list)[number]): Entry => c.entry ?? { el: c.el, role: "generic" };
    if (!from) {
      const order = dir === 1 ? list : [...list].reverse();
      for (const c of order) {
        const top = viewportRect(c.el).top;
        if (dir === 1 ? top >= 0 : top < 0) return { entry: asEntry(c), wrapped: false };
      }
      return { entry: asEntry(order[0]!), wrapped: true };
    }
    if (dir === 1) {
      const c = list.find((x) => x.el !== from && compareFlat(from, x.el) < 0);
      return c ? { entry: asEntry(c), wrapped: false } : { entry: asEntry(list[0]!), wrapped: true };
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const x = list[i]!;
      if (x.el !== from && compareFlat(x.el, from) < 0) return { entry: asEntry(x), wrapped: false };
    }
    return { entry: asEntry(list[list.length - 1]!), wrapped: true };
  }

  jump(target: TargetId, dir: Dir, loose = false): void {
    const def = TARGET_BY_ID[target];
    const from = this.startPoint();
    const hit = this.findNext(target, dir, from, loose);
    if (!hit) {
      this.overlay.toast(this.noneMessage(target, loose));
      return;
    }
    const { entry, wrapped } = hit;
    if (entry.el === this.cursor) {
      this.overlay.toast(`That's the only ${loose ? `${def.singular} or look-alike` : def.singular}`);
    } else if (wrapped) {
      this.overlay.toast(dir === 1 ? "Wrapped to top" : "Wrapped to bottom", 1200);
    }
    this.startHint = null;
    const fake = loose ? this.suspects.find((s) => s.el === entry.el) : undefined;
    if (fake) this.setSuspectCursor(fake, target);
    else this.setCursor(entry.el, entry);
    if (this.mode && (this.mode.target !== target || this.mode.loose !== loose)) this.mode = null;
    if (!loose && from && !wrapped && WARN_ON.has(target) && this.settings.showClickableWarnings) {
      this.warnPassed(from, entry.el, dir, target);
    }
  }

  private noneMessage(target: TargetId, loose = false): string {
    const def = TARGET_BY_ID[target];
    const base = `No ${def.plural} on this page`;
    if (loose) return `${base}, and nothing that looks clickable either`;
    if ((target === "button" || target === "link") && this.ensureSuspects().length) {
      const n = this.suspects.length;
      const key = (this.settings.targetKeys[target]?.[0] ?? "").toUpperCase();
      const how = key ? `Use ${this.settings.nextKey}${key} to reach ${n > 1 ? "them" : "it"} anyway.` : `Open the rotor (${this.settings.highlightKey}${this.settings.highlightKey}) → Issues.`;
      return `${base}, but ${n} element${n > 1 ? "s" : ""} look${n > 1 ? "" : "s"} clickable. ${how}`;
    }
    if (target === "landmark") return `${base}. Screen reader users can't skip to the main content.`;
    return base;
  }

  private warnPassed(from: Element, to: Element, dir: Dir, target: TargetId): void {
    // Use the last background scan even if the page changed since; it's only a hint.
    const list = this.suspects;
    if (!list.length) return;
    const [a, b] = dir === 1 ? [from, to] : [to, from];
    const passed = list.filter((s) => s.el.isConnected && compareFlat(a, s.el) < 0 && compareFlat(s.el, b) < 0);
    const shown = (dir === 1 ? passed.slice(-6) : passed.slice(0, 6)).map((s) => ({ el: s.el, message: suspectMessage(s, target) }));
    this.overlay.flashWarnings(shown);
  }

  /** Cursor on a look-alike: flagged as fake, and Enter clicks it. */
  private setSuspectCursor(s: Suspect, target?: TargetId): void {
    this.cursor = s.el;
    this.cursorSuspect = s;
    const text = truncate((s.el.textContent ?? "").replace(/\s+/g, " ").trim(), 60);
    const name = text || truncate(s.el.getAttribute("title") ?? s.el.getAttribute("aria-label") ?? "", 60);
    this.overlay.setCurrent(
      s.el,
      { role: `${s.el.localName}, not a ${target === "link" ? "link" : "button"}`, name, unnamed: false, fake: true, tags: [{ text: "Enter clicks", warn: true }] },
      () => this.platform.openExplainer("clickable"),
    );
    this.scrollTo(s.el);
  }

  setCursor(el: Element, entry?: Entry): void {
    this.cursor = el;
    this.cursorSuspect = null;
    const role = entry?.role ?? computeRole(el) ?? "generic";
    const required = NAME_REQUIRED_ROLES.has(role);
    const accName = truncate(accessibleName(el));
    const unnamed = required && !accName;
    const name = displayName(el, accName, required);
    const tags: LabelInfo["tags"] = [];
    const st = elementStates(el, role);
    if (st.disabled) tags.push({ text: "disabled" });
    if (st.checked !== undefined) tags.push({ text: st.checked === "mixed" ? "mixed" : st.checked ? "checked" : "unchecked" });
    if (st.pressed !== undefined) tags.push({ text: st.pressed ? "pressed" : "not pressed" });
    if (st.expanded !== undefined) tags.push({ text: st.expanded ? "expanded" : "collapsed" });
    if (st.required) tags.push({ text: "required" });
    const hidden = isVisuallyHidden(el);
    if (hidden) tags.push({ text: "visually hidden" });
    const roleText = role === "heading" ? `heading ${entry?.level ?? headingLevel(el)}` : role;
    this.overlay.setCurrent(
      el,
      { role: roleText, name, unnamed, tags },
      unnamed ? () => this.platform.openExplainer("unnamed") : undefined,
    );
    this.scrollTo(hidden ? visibleAnchor(el) : el);
  }

  private scrollTo(el: Element): void {
    const r = viewportRect(el);
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const fully = r.top >= 0 && r.top + r.height <= vh && r.left >= 0 && r.left + r.width <= vw;
    if (fully) return;
    el.scrollIntoView({
      block: r.height > vh * 0.8 ? "start" : "center",
      inline: "nearest",
      behavior: this.reducedMotion.matches ? "instant" : "smooth",
    });
  }

  // ---------------------------------------------------------------- enter

  /** Returns false when Enter should go to the page (already focused → activate). */
  private enter(): boolean {
    const el = this.cursor as HTMLElement | null;
    if (!el?.isConnected) return false;
    if (this.cursorSuspect?.el === el) {
      this.clickSuspect(el);
      return true;
    }
    if (deepActiveElement(this.doc) === el) return false;
    this.selfFocus = true;
    try {
      const focusable = el.tabIndex >= 0 || el.hasAttribute("tabindex");
      if (!focusable) {
        el.setAttribute("tabindex", "-1");
        el.addEventListener("blur", () => el.removeAttribute("tabindex"), { once: true });
      }
      el.focus({ preventScroll: true });
    } finally {
      this.selfFocus = false;
    }
    if (deepActiveElement(this.doc) !== el) {
      this.overlay.toast(elementStates(el, "").disabled ? "It's disabled, so it can't take focus" : "Couldn't focus that element");
      return true;
    }
    const role = computeRole(el) ?? "";
    if (isEditable(el)) this.overlay.toast(hint("Focused. Type away; ", "Esc", " to leave the field."));
    else if (role === "button" || role === "link") this.overlay.toast(hint("Focused. ", "Enter", " again to activate."));
    return true;
  }

  /**
   * A look-alike usually has no keyboard handler, so focusing it does
   * nothing useful. Play the mouse sequence instead, so handlers bound to
   * pointerdown/mousedown fire as well as click ones.
   */
  private clickSuspect(el: HTMLElement): void {
    const r = el.getBoundingClientRect();
    const view = el.ownerDocument.defaultView ?? window;
    const at = { bubbles: true, cancelable: true, composed: true, view, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    this.selfClick = true;
    try {
      const P = (view as typeof window).PointerEvent ?? (view as typeof window).MouseEvent;
      const M = (view as typeof window).MouseEvent;
      el.dispatchEvent(new P("pointerdown", { ...at, buttons: 1, pointerType: "mouse", isPrimary: true } as PointerEventInit));
      el.dispatchEvent(new M("mousedown", { ...at, buttons: 1 }));
      el.dispatchEvent(new P("pointerup", { ...at, pointerType: "mouse", isPrimary: true } as PointerEventInit));
      el.dispatchEvent(new M("mouseup", at));
      el.click();
    } finally {
      this.selfClick = false;
    }
    this.overlay.toast("Clicked. It isn't a real button, so Squarb clicked it for you; keyboard users without Squarb can't.", 3500);
  }

  // ---------------------------------------------------------------- highlight all

  private matchesFor(target: TargetId): Entry[] {
    const modal = topModal(this.doc);
    return this.index.all().filter((e) => entryMatches(e, target) && isNavigable(e, modal));
  }

  highlightAll(target: TargetId, loose = false): void {
    const def = TARGET_BY_ID[target];
    const list = loose ? this.looseCandidates(target) : this.matchesFor(target).map((entry) => ({ el: entry.el, entry }));
    if (!list.length) {
      this.mode = null;
      this.overlay.clearAll();
      this.overlay.toast(this.noneMessage(target, loose));
      return;
    }
    this.mode = { target, loose };
    this.last = { target, dir: 1, loose };
    let unnamed = 0;
    let fakes = 0;
    const items = list.map((c) => {
      if (!c.entry) {
        fakes++;
        return { el: c.el, unnamed: false, fake: true };
      }
      const u = NAME_REQUIRED_ROLES.has(c.entry.role) && !accessibleName(c.el);
      if (u) unnamed++;
      return { el: c.el, unnamed: u };
    });
    this.overlay.setAll(items);
    const N = this.settings.nextKey;
    const P = this.settings.prevKey;
    const realN = list.length - fakes;
    const count = `${realN} ${realN === 1 ? def.singular : def.plural}`;
    const extra = [unnamed ? `${unnamed} unnamed` : "", fakes ? `+ ${fakes} look-alike${fakes > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ");
    this.overlay.toast(hint(`${count}${extra ? ` (${extra})` : ""} · `, N, " / ", P, " to step · ", "Esc", " to exit"), 3000);
  }

  // ---------------------------------------------------------------- rotor

  openRotor(): void {
    void this.overlay;
    this.mode = null;
    this._overlay!.clearAll();
    this.help?.close();
    this.ensureSuspects();
    this.rotor!.open();
  }

  private rotorItems(groupId: string): RotorItem[] {
    if (groupId === "issues") {
      return collectIssues(this.index, this.suspects, this.doc).map((i) => {
        const item: RotorItem = {
          role: i.kind,
          name: i.message,
          unnamed: false,
          warn: true,
          tag: i.el ? (computeRole(i.el) ?? i.el.localName) : "page",
        };
        if (i.el) item.el = i.el;
        return item;
      });
    }
    const g = ROTOR_GROUPS.find((x) => x.id === groupId);
    if (!g?.target) return [];
    return this.matchesFor(g.target).map((e) => {
      const required = NAME_REQUIRED_ROLES.has(e.role);
      const accName = truncate(accessibleName(e.el), 120);
      const unnamed = required && !accName;
      const name = displayName(e.el, accName, required);
      const tags: string[] = [];
      if (elementStates(e.el, e.role).disabled) tags.push("disabled");
      if (isVisuallyHidden(e.el)) tags.push("visually hidden");
      const item: RotorItem = {
        el: e.el,
        role: roleLabel(e),
        name,
        unnamed,
        ...(tags.length ? { tag: tags.join(" · ") } : {}),
        ...(e.role === "heading" ? { indent: e.level ?? 2 } : {}),
      };
      return item;
    });
  }

  private chooseRotorItem(item: RotorItem): void {
    if (!item.el) {
      this.platform.openExplainer();
      return;
    }
    const s = this.suspects.find((x) => x.el === item.el);
    if (s) {
      this.startHint = null;
      this.setSuspectCursor(s);
      this.overlay.toast(hint(suspectMessage(s) + ". ", "Enter", " clicks it."), 3500);
      return;
    }
    this.setCursor(item.el);
  }

  // ---------------------------------------------------------------- clickable scan

  /** Synchronous scan (used when we need results right now). */
  ensureSuspects(): Suspect[] {
    if (!this.suspectsStale) return this.suspects;
    clearTimeout(this.scanTimer);
    const out: Suspect[] = [];
    const it = scanClickables(this.doc.documentElement, runHandlerProbe(this.doc), out, Number.MAX_SAFE_INTEGER);
    while (!it.next().done);
    this.suspects = out;
    this.suspectsStale = false;
    return out;
  }

  /** Background scan in idle slices, so warnings are ready before they're needed. */
  scheduleSuspectScan(delay = 1200): void {
    this.suspectsStale = true;
    clearTimeout(this.scanTimer);
    this.scanTimer = window.setTimeout(() => this.idleScan(), delay);
  }

  private idleScan(): void {
    const out: Suspect[] = [];
    const it = scanClickables(this.doc.documentElement, runHandlerProbe(this.doc), out);
    const ric: (cb: (d: IdleDeadline) => void) => void =
      window.requestIdleCallback?.bind(window) ?? ((cb) => setTimeout(() => cb({ timeRemaining: () => 8, didTimeout: false }), 16));
    const step = (d: IdleDeadline) => {
      while (d.timeRemaining() > 2) {
        if (it.next().done) {
          if (this.suspectsStale) {
            this.suspects = out;
            this.suspectsStale = false;
          }
          return;
        }
      }
      ric(step);
    };
    ric(step);
  }

  /** Called on first use so the clickable scan is warm by the second jump. */
  warmUp(): void {
    this.index.refresh();
    if (this.suspectsStale) this.scheduleSuspectScan(300);
  }

  // ---------------------------------------------------------------- toolbar

  toggleHelp(): void {
    void this.overlay;
    this.help!.toggle(this.settings);
  }
}

/** Build "text <kbd>key</kbd> text …" — alternate plain and key parts. */
function hint(...parts: string[]): DocumentFragment {
  const f = document.createDocumentFragment();
  parts.forEach((p, i) => {
    if (!p) return;
    if (i % 2 === 1) {
      const k = document.createElement("kbd");
      k.textContent = p;
      f.append(k);
    } else f.append(p);
  });
  return f;
}
