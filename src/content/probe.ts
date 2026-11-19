/**
 * Main-world probe. Content scripts run in an isolated world and can't see
 * page JavaScript (el.onclick, React props…), so this tiny script runs in the
 * page's world, and only when asked. It marks elements that have a click
 * handler, the isolated world reads the marks, and then they're removed.
 *
 * It never reads or sends page data anywhere; it only sets and clears one
 * attribute.
 */

const ATTR = "data-squarb-click";
const NATIVE = new Set(["a", "button", "input", "select", "textarea", "summary", "label", "option", "html", "body"]);
const ROLE_OK = /^(button|link|menuitem|menuitemcheckbox|menuitemradio|tab|checkbox|radio|switch|option|treeitem|gridcell|combobox|slider|spinbutton)$/;

type AnyEl = Element & Record<string, unknown>;

function frameworkHandler(el: AnyEl): string | null {
  if (typeof (el as unknown as HTMLElement).onclick === "function") return "onclick";
  for (const k of Object.keys(el)) {
    if (k.startsWith("__reactProps$") || k.startsWith("__reactEventHandlers$")) {
      const p = el[k] as Record<string, unknown> | null;
      if (p && (typeof p.onClick === "function" || typeof p.onMouseDown === "function" || typeof p.onPointerDown === "function")) {
        return "React";
      }
    } else if (k === "_vei") {
      const v = el[k] as Record<string, unknown> | null;
      if (v && (v.onClick || v.onMousedown || v.onPointerdown)) return "Vue";
    } else if (k === "l") {
      const l = el[k] as Record<string, unknown> | null;
      if (l && typeof l === "object" && Object.keys(l).some((n) => /^click/i.test(n))) return "Preact";
    }
  }
  const jq = (window as unknown as { jQuery?: { _data?: (e: Element, k: string) => Record<string, unknown> | undefined } }).jQuery;
  if (jq?._data) {
    try {
      if (jq._data(el, "events")?.click) return "jQuery";
    } catch {
      /* ignore */
    }
  }
  return null;
}

const marked: Element[] = [];

function scan(root: Document | ShadowRoot): void {
  for (const el of root.querySelectorAll("*")) {
    const sr = (el as HTMLElement).shadowRoot;
    if (sr) scan(sr);
    if (el.localName === "iframe") {
      try {
        const d = (el as HTMLIFrameElement).contentDocument;
        if (d) scan(d);
      } catch {
        /* cross-origin */
      }
    }
    if (NATIVE.has(el.localName)) continue;
    const role = el.getAttribute("role");
    if (role && ROLE_OK.test(role.trim())) continue;
    const fw = frameworkHandler(el as AnyEl);
    if (fw) {
      el.setAttribute(ATTR, fw);
      marked.push(el);
    }
  }
}

document.addEventListener("squarb:probe", () => {
  try {
    scan(document);
  } catch {
    /* never break the page */
  }
});

document.addEventListener("squarb:probe-done", () => {
  for (const el of marked.splice(0)) el.removeAttribute(ATTR);
});
