import { flatParent, isElement } from "./tree";

/**
 * Two separate questions:
 *
 * 1. Is it rendered at all? display:none, visibility:hidden,
 *    content-visibility:hidden, closed <dialog>/popover, `hidden` — all of
 *    these remove the element from the accessibility tree too, so we skip it.
 *
 * 2. Is it *visually* hidden? .sr-only clipping, 1×1 boxes, off-screen
 *    positioning. These ARE in the accessibility tree (a screen reader reads
 *    them), so we still navigate to them, but label them "visually hidden".
 */

export function isRendered(el: Element): boolean {
  const anyEl = el as Element & { checkVisibility?: (o?: object) => boolean };
  if (typeof anyEl.checkVisibility === "function") {
    if (anyEl.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: false })) return true;
    // display:contents has no box, so checkVisibility says false — but the
    // element is still exposed. Defer to its parent.
    const view = el.ownerDocument.defaultView;
    if (view && view.getComputedStyle(el).display === "contents") {
      const p = flatParent(el);
      return isElement(p) ? isRendered(p) : true;
    }
    return false;
  }
  return isRenderedByStyle(el);
}

/** Fallback for environments without checkVisibility (jsdom in unit tests). */
function isRenderedByStyle(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  const self = view.getComputedStyle(el);
  if (self.visibility === "hidden" || self.visibility === "collapse") return false;
  for (let n: Node | null = el; n; n = flatParent(n)) {
    if (!isElement(n)) continue;
    if ((n as HTMLElement).hidden) return false;
    if (n.localName === "dialog" && !n.hasAttribute("open")) return false;
    if (n.localName === "details" && n !== el && !n.hasAttribute("open") && !isSummaryOf(el, n)) return false;
    const v = n.ownerDocument.defaultView ?? view;
    const cs = v.getComputedStyle(n);
    if (cs.display === "none") return false;
    if (cs.getPropertyValue("content-visibility") === "hidden" && n !== el) return false;
  }
  return true;
}

function isSummaryOf(el: Element, details: Element): boolean {
  const summary = details.querySelector(":scope > summary");
  return !!summary && (summary === el || summary.contains(el));
}

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Bounding box in top-level viewport coordinates (adds same-origin frame offsets). */
export function viewportRect(el: Element): Box {
  const r = el.getBoundingClientRect();
  let top = r.top;
  let left = r.left;
  let win = el.ownerDocument.defaultView;
  while (win && win !== win.top) {
    let frame: Element | null = null;
    try {
      frame = win.frameElement;
    } catch {
      break;
    }
    if (!frame) break;
    const fr = frame.getBoundingClientRect();
    const fs = frame.ownerDocument.defaultView!.getComputedStyle(frame);
    top += fr.top + frame.clientTop + parseFloat(fs.paddingTop || "0");
    left += fr.left + frame.clientLeft + parseFloat(fs.paddingLeft || "0");
    win = frame.ownerDocument.defaultView;
  }
  return { top, left, width: r.width, height: r.height };
}

/**
 * Visually hidden but still exposed: tiny, clipped, or positioned outside the
 * scrollable page area (the classic `left: -9999px`).
 */
export function isVisuallyHidden(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width <= 1 || r.height <= 1) {
    // Zero-size wrapper whose children overflow visibly isn't "hidden".
    if (r.width === 0 && r.height === 0 && el.children.length > 0) {
      const child = el.children[0]!.getBoundingClientRect();
      if (child.width > 1 && child.height > 1) return false;
    }
    return true;
  }
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  const docEl = el.ownerDocument.documentElement;
  if (r.right + view.scrollX <= 0 || r.bottom + view.scrollY <= 0) return true;
  if (r.left + view.scrollX >= Math.max(docEl.scrollWidth, view.innerWidth) + 1000) return true;
  const cs = view.getComputedStyle(el);
  if (cs.clip && /rect\(\s*0(px)?[\s,]+0(px)?[\s,]+0(px)?[\s,]+0(px)?\s*\)/.test(cs.clip)) return true;
  if (cs.clipPath && /inset\(\s*50%/.test(cs.clipPath)) return true;
  return false;
}

/** Nearest flat-tree ancestor with a real box, for drawing visually hidden targets. */
export function visibleAnchor(el: Element): Element {
  for (let n: Node | null = flatParent(el); n; n = flatParent(n)) {
    if (!isElement(n)) continue;
    const r = n.getBoundingClientRect();
    if (r.width > 4 && r.height > 4 && !isVisuallyHidden(n)) return n;
  }
  return el.ownerDocument.body ?? el;
}

export function inViewport(el: Element): boolean {
  const r = viewportRect(el);
  return r.top + r.height > 0 && r.top < window.innerHeight && r.left + r.width > 0 && r.left < window.innerWidth;
}
