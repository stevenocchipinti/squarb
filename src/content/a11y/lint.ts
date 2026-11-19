import { INTERACTIVE_ROLES, NAME_REQUIRED_ROLES } from "../../shared/targets";
import { isNavigable, topModal, type Entry, type RoleIndex } from "./index";
import { accessibleName } from "./names";
import { computeRole } from "./roles";
import { excludesSubtree, flatChildren, frameDocument, compareFlat } from "./tree";
import { isRendered } from "./visibility";

/**
 * "Looks interactive but isn't exposed": the clickable <div> problem.
 *
 * Signals, cheapest first:
 *  - an `onclick` attribute
 *  - a framework click handler (React/Vue/Preact/jQuery/el.onclick), found
 *    by a tiny main-world probe because content scripts can't see page JS
 *  - `tabindex="0"` (or higher) with no role
 *  - `cursor: pointer` starting on this element (not inherited from a parent)
 */

export type ClickReason = "onclick" | "handler" | "tabindex" | "cursor";

export interface Suspect {
  el: Element;
  reasons: ClickReason[];
  /** Framework name when the handler probe found one. */
  framework?: string;
}

export const PROBE_ATTR = "data-squarb-click";

const INTERACTIVE_DESCENDANT =
  'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=menuitem],[role=tab],[role=checkbox],[role=switch],[role=option],[contenteditable=""],[contenteditable=true]';

const SKIP_TAGS = new Set(["html", "body", "label", "option", "optgroup", "video", "audio", "canvas", "map", "area"]);

interface Frame {
  el: Element;
  insideInteractive: boolean;
  parentPointer: boolean;
}

/** Ask the main-world probe to mark elements with framework click handlers. */
export function runHandlerProbe(doc: Document = document): Map<Element, string> {
  const found = new Map<Element, string>();
  try {
    doc.dispatchEvent(new CustomEvent("squarb:probe"));
    for (const el of deepQueryAll(doc, `[${PROBE_ATTR}]`)) found.set(el, el.getAttribute(PROBE_ATTR) || "handler");
    doc.dispatchEvent(new CustomEvent("squarb:probe-done"));
  } catch {
    /* no probe */
  }
  return found;
}

function deepQueryAll(root: Document | ShadowRoot, sel: string): Element[] {
  const out = [...root.querySelectorAll(sel)];
  for (const el of root.querySelectorAll("*")) {
    const sr = (el as HTMLElement).shadowRoot;
    if (sr) out.push(...deepQueryAll(sr, sel));
  }
  return out;
}

/**
 * Generator so the caller can run it in idle-time slices on huge pages.
 * Yields after every `sliceSize` elements.
 */
export function* scanClickables(
  root: Element,
  handlers: Map<Element, string>,
  out: Suspect[],
  sliceSize = 2000,
): Generator<void, Suspect[], void> {
  const stack: Frame[] = [{ el: root, insideInteractive: false, parentPointer: false }];
  let n = 0;
  while (stack.length) {
    const f = stack.pop()!;
    const el = f.el;
    if (excludesSubtree(el)) continue;
    if (++n % sliceSize === 0) yield;

    const role = computeRole(el);
    const interactive = !!role && INTERACTIVE_ROLES.has(role);
    const view = el.ownerDocument.defaultView;
    let pointer = false;
    try {
      pointer = !!view && view.getComputedStyle(el).cursor === "pointer";
    } catch {
      /* detached */
    }

    if (!interactive && !f.insideInteractive && !SKIP_TAGS.has(el.localName)) {
      const reasons: ClickReason[] = [];
      if (el.hasAttribute("onclick")) reasons.push("onclick");
      const fw = handlers.get(el);
      if (fw) reasons.push("handler");
      const ti = el.getAttribute("tabindex");
      if (ti !== null && parseInt(ti, 10) >= 0 && !el.hasAttribute("role")) reasons.push("tabindex");
      if (pointer && !f.parentPointer) reasons.push("cursor");
      if (reasons.length && looksLikeAControl(el)) {
        out.push(fw ? { el, reasons, framework: fw } : { el, reasons });
      }
    }

    const ln = el.localName;
    if (ln === "iframe" || ln === "frame") {
      const doc = frameDocument(el);
      if (doc) stack.push({ el: doc.documentElement, insideInteractive: false, parentPointer: false });
      continue;
    }
    const kids = flatChildren(el);
    const inside = f.insideInteractive || interactive || ln === "label";
    for (let i = kids.length - 1; i >= 0; i--) {
      stack.push({ el: kids[i]!, insideInteractive: inside, parentPointer: pointer });
    }
  }
  return out;
}

function looksLikeAControl(el: Element): boolean {
  // A card that already contains a real link/button is a different pattern.
  if (el.querySelector(INTERACTIVE_DESCENDANT)) return false;
  if (!isRendered(el)) return false;
  const r = el.getBoundingClientRect();
  const view = el.ownerDocument.defaultView;
  // Real layout: ignore empty boxes and page-sized wrappers.
  if (view && (r.width || r.height)) {
    if (r.width < 4 || r.height < 4) return false;
    if (r.width * r.height > view.innerWidth * view.innerHeight * 0.6) return false;
  }
  return true;
}

export function scanClickablesSync(root: Element, handlers = new Map<Element, string>()): Suspect[] {
  const out: Suspect[] = [];
  const it = scanClickables(root, handlers, out, Number.MAX_SAFE_INTEGER);
  while (!it.next().done);
  return out;
}

/** Human wording. Explains, doesn't scold. */
export function suspectMessage(s: Suspect, target?: string): string {
  const what = target === "link" ? "link" : "button";
  const fw = s.framework && s.framework !== "onclick" ? s.framework : null;
  const how = fw
    ? `has a ${fw} click handler`
    : s.reasons.includes("onclick") || s.framework === "onclick"
      ? "has an onclick handler"
      : s.reasons.includes("tabindex")
        ? "is focusable"
        : "has a pointer cursor";
  return `Looks clickable (${how}) but has no ${what} role`;
}

// -------------------------------------------------------------------- issues

export type IssueKind = "unnamed" | "clickable" | "heading-skip" | "no-main" | "multiple-main" | "no-h1" | "cross-origin";

export interface Issue {
  kind: IssueKind;
  message: string;
  el?: Element;
  /** Anchor on the bundled explainer page. */
  explain: string;
}

export function collectIssues(index: RoleIndex, suspects: readonly Suspect[], doc: Document = document): Issue[] {
  const modal = topModal(doc);
  const entries = index.all().filter((e) => isNavigable(e, modal));
  const issues: Issue[] = [];

  for (const e of entries) {
    if (NAME_REQUIRED_ROLES.has(e.role) && !accessibleName(e.el)) {
      issues.push({ kind: "unnamed", el: e.el, message: `${roleLabel(e)} has no accessible name`, explain: "unnamed" });
    }
  }
  for (const s of suspects) {
    if (s.el.isConnected) issues.push({ kind: "clickable", el: s.el, message: suspectMessage(s), explain: "clickable" });
  }

  const headings = entries.filter((e) => e.role === "heading");
  let prev = 0;
  for (const h of headings) {
    const lvl = h.level ?? 2;
    if (prev && lvl > prev + 1) {
      issues.push({
        kind: "heading-skip",
        el: h.el,
        message: `Heading level jumps from ${prev} to ${lvl}`,
        explain: "heading-skip",
      });
    }
    prev = lvl;
  }
  if (headings.length && !headings.some((h) => h.level === 1)) {
    issues.push({ kind: "no-h1", message: "No level 1 heading on this page", explain: "heading-skip" });
  }

  const mains = entries.filter((e) => e.role === "main");
  if (!mains.length) issues.push({ kind: "no-main", message: "No main landmark", explain: "main-landmark" });
  if (mains.length > 1) {
    issues.push({ kind: "multiple-main", el: mains[1]!.el, message: `${mains.length} main landmarks`, explain: "main-landmark" });
  }

  const xo = index.getStats().crossOriginFrames;
  if (xo) {
    issues.push({
      kind: "cross-origin",
      message: `${xo} cross-origin frame${xo > 1 ? "s" : ""} skipped (extensions can't read inside them from here)`,
      explain: "frames",
    });
  }

  // Keep page order for anything anchored to an element.
  return issues.sort((a, b) => (a.el && b.el ? compareFlat(a.el, b.el) : a.el ? -1 : b.el ? 1 : 0));
}

export function roleLabel(e: Entry): string {
  return e.role === "heading" ? `heading ${e.level ?? 2}` : e.role;
}
