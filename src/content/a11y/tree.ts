/**
 * Flat-tree ("composed") traversal and ordering.
 *
 * Screen readers read in rendered order: shadow trees replace their host's
 * children, slots are replaced by whatever is assigned to them, and
 * same-origin iframes are inlined where the <iframe> sits. Cross-origin
 * frames can't be reached from a content script, so they're counted and
 * skipped.
 */

export const OWN_UI_ATTR = "data-squarb-ui";

/** Elements that never contain anything a user can perceive. */
const NEVER_RENDERED = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "head",
  "meta",
  "link",
  "title",
  "base",
]);

export function isElement(n: Node | null | undefined): n is Element {
  return !!n && n.nodeType === 1;
}

/**
 * Exclusion that CSS visibility checks can't see: `aria-hidden="true"` and
 * `inert` remove a whole subtree from the accessibility tree even when it's
 * painted. (display:none, `hidden`, closed <dialog>/popover are visibility,
 * checked lazily at query time so toggling them needs no re-index.)
 */
export function excludesSubtree(el: Element): boolean {
  if (NEVER_RENDERED.has(el.localName)) return true;
  if (el.hasAttribute(OWN_UI_ATTR)) return true;
  if (el.getAttribute("aria-hidden") === "true") return true;
  if (el.hasAttribute("inert")) return true;
  return false;
}

/** Same-origin iframe document, or null if cross-origin / not loaded. */
export function frameDocument(el: Element): Document | null {
  const ln = el.localName;
  if (ln !== "iframe" && ln !== "frame") return null;
  try {
    const doc = (el as HTMLIFrameElement).contentDocument;
    return doc && doc.documentElement ? doc : null;
  } catch {
    return null;
  }
}

export function isCrossOriginFrame(el: Element): boolean {
  const ln = el.localName;
  if (ln !== "iframe" && ln !== "frame") return false;
  try {
    return (el as HTMLIFrameElement).contentDocument === null;
  } catch {
    return true;
  }
}

/** Children in flat-tree order. */
export function flatChildren(el: Element): ArrayLike<Element> {
  const sr = (el as HTMLElement).shadowRoot;
  if (sr) return sr.children;
  if (el.localName === "slot") {
    const slot = el as HTMLSlotElement;
    if (slot.getRootNode().nodeType === 11) {
      const assigned = slot.assignedElements();
      if (assigned.length) return assigned;
    }
    return slot.children;
  }
  const doc = frameDocument(el);
  if (doc) return [doc.documentElement];
  return el.children;
}

/** Parent in the flat tree, crossing shadow and same-origin frame boundaries. */
export function flatParent(node: Node): Node | null {
  if (isElement(node) || node.nodeType === 3) {
    const slot = (node as Element).assignedSlot;
    if (slot) return slot;
  }
  const p = node.parentNode;
  if (!p) return null;
  if (p.nodeType === 11) return (p as ShadowRoot).host ?? null; // ShadowRoot
  if (p.nodeType === 9) {
    // Document → its <iframe> element in the parent document (same-origin only).
    try {
      return (p as Document).defaultView?.frameElement ?? null;
    } catch {
      return null;
    }
  }
  return p;
}

/** Is `node` inside (or equal to) `root` in the flat tree? */
export function flatContains(root: Node, node: Node): boolean {
  for (let n: Node | null = node; n; n = flatParent(n)) if (n === root) return true;
  return false;
}

function chain(node: Node): Node[] {
  const out: Node[] = [];
  for (let n: Node | null = node; n; n = flatParent(n)) out.push(n);
  return out.reverse();
}

/**
 * Negative if a comes before b in flat-tree order, positive if after, 0 if
 * equal. Ancestors come before descendants.
 */
export function compareFlat(a: Node, b: Node): number {
  if (a === b) return 0;
  // Fast path: same tree, no slots in play.
  if (a.getRootNode() === b.getRootNode() && !(a as Element).assignedSlot && !(b as Element).assignedSlot) {
    const sameDocNoShadow = !hasShadowBetween(a) && !hasShadowBetween(b);
    if (sameDocNoShadow) {
      const pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_CONTAINED_BY) return -1;
      if (pos & Node.DOCUMENT_POSITION_CONTAINS) return 1;
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    }
  }
  const ca = chain(a);
  const cb = chain(b);
  let i = 0;
  while (i < ca.length && i < cb.length && ca[i] === cb[i]) i++;
  if (i === ca.length) return -1; // a is an ancestor of b
  if (i === cb.length) return 1;
  const x = ca[i]!;
  const y = cb[i]!;
  const pos = x.compareDocumentPosition(y);
  return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/**
 * True if any ancestor (in the light tree) is a shadow host or slot, which
 * means DOM order may differ from flat order. Cheap enough for the fast path
 * because most pages have no shadow DOM at all.
 */
let anyShadowSeen = false;
export function noteShadowSeen(): void {
  anyShadowSeen = true;
}
function hasShadowBetween(n: Node): boolean {
  if (!anyShadowSeen) return false;
  for (let p = n.parentNode; p && p.nodeType === 1; p = p.parentNode) {
    if ((p as Element).shadowRoot) return true;
  }
  return false;
}

export interface WalkHooks {
  /** Called for every element not excluded; return true to skip its subtree. */
  visit(el: Element): boolean | void;
  onShadowRoot?(root: ShadowRoot): void;
  onFrame?(frame: HTMLIFrameElement, doc: Document | null): void;
}

/**
 * Depth-first flat-tree walk starting at `root` (inclusive). Iterative so huge
 * pages don't blow the stack.
 */
export function walkFlat(root: Element, hooks: WalkHooks): void {
  const stack: Element[] = [root];
  while (stack.length) {
    const el = stack.pop()!;
    if (excludesSubtree(el)) continue;
    if (hooks.visit(el) === true) continue;
    const sr = (el as HTMLElement).shadowRoot;
    if (sr) {
      noteShadowSeen();
      hooks.onShadowRoot?.(sr);
    }
    const ln = el.localName;
    if (ln === "iframe" || ln === "frame") {
      const doc = frameDocument(el);
      hooks.onFrame?.(el as HTMLIFrameElement, doc);
      if (doc) stack.push(doc.documentElement);
      continue;
    }
    const kids = flatChildren(el);
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!);
  }
}

/** Walk up the flat tree checking for aria-hidden / inert ancestors. */
export function isExcludedByAncestor(el: Element): boolean {
  for (let n: Node | null = el; n; n = flatParent(n)) {
    if (isElement(n) && excludesSubtree(n)) return true;
  }
  return false;
}

/** Deepest active element, through shadow roots and same-origin frames. */
export function deepActiveElement(doc: Document = document): Element | null {
  let a: Element | null = doc.activeElement;
  for (;;) {
    if (!a) return null;
    const sr = (a as HTMLElement).shadowRoot;
    if (sr?.activeElement) {
      a = sr.activeElement;
      continue;
    }
    const fd = frameDocument(a);
    if (fd?.activeElement && fd.activeElement !== fd.body) {
      a = fd.activeElement;
      continue;
    }
    return a;
  }
}
