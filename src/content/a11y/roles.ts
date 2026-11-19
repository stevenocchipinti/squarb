import { getRole } from "dom-accessibility-api";
import { isElement, flatParent } from "./tree";

/**
 * Computed role, as close to Chrome's accessibility tree as we can get from
 * the DOM. Starts from dom-accessibility-api (the html-aria mapping Testing
 * Library uses) and patches the cases where Chrome differs or the library is
 * silent.
 */
export function computeRole(el: Element): string | null {
  let role = getRole(el);
  if (role === "presentation" || role === "none") return null;

  const explicit = el.hasAttribute("role");
  const ln = el.localName;

  if (!explicit) {
    switch (ln) {
      case "input":
        role = inputRole(el as HTMLInputElement) ?? role;
        break;
      case "header":
      case "footer":
        // Only page-level header/footer are banner/contentinfo landmarks.
        if (hasSectioningAncestor(el)) return null;
        break;
      case "svg":
        // Chrome exposes every <svg>; most are decorative icons inside a
        // button. Count it as a graphic only if the author gave it a name.
        return svgHasName(el) ? "img" : null;
      case "li":
        // <ul role="none"><li> — the list items lose their semantics too.
        if (parentRoleIsPresentational(el)) return null;
        break;
    }
    if (role === null && isContentEditable(el) && !parentIsEditable(el)) {
      return "textbox";
    }
  }
  return role;
}

function inputRole(input: HTMLInputElement): string | null {
  const type = (input.getAttribute("type") ?? "text").toLowerCase();
  switch (type) {
    case "hidden":
      return null;
    case "password":
    case "date":
    case "datetime-local":
    case "month":
    case "week":
    case "time":
      return "textbox";
    case "file":
    case "color":
      return "button";
    default:
      return null; // let the library decide
  }
}

const SECTIONING = new Set(["article", "aside", "main", "nav", "section"]);
const SECTIONING_ROLES = new Set(["article", "complementary", "main", "navigation", "region"]);

function hasSectioningAncestor(el: Element): boolean {
  for (let n = flatParent(el); n; n = flatParent(n)) {
    if (!isElement(n)) continue;
    if (SECTIONING.has(n.localName)) return true;
    const r = n.getAttribute("role");
    if (r && SECTIONING_ROLES.has(r.trim().split(/\s+/)[0]!)) return true;
  }
  return false;
}

function parentRoleIsPresentational(el: Element): boolean {
  const p = el.parentElement;
  if (!p) return false;
  const r = p.getAttribute("role")?.trim().split(/\s+/)[0];
  return r === "none" || r === "presentation";
}

function parentIsEditable(el: Element): boolean {
  const p = el.parentElement;
  return !!p && isContentEditable(p);
}

/** isContentEditable, with an attribute fallback for DOMs that lack it (jsdom). */
export function isContentEditable(el: Element): boolean {
  const v = (el as HTMLElement).isContentEditable;
  if (typeof v === "boolean") return v;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const a = n.getAttribute("contenteditable");
    if (a === null) continue;
    return a === "" || a === "true" || a === "plaintext-only";
  }
  return false;
}

function svgHasName(svg: Element): boolean {
  if (svg.hasAttribute("aria-label") || svg.hasAttribute("aria-labelledby")) return true;
  for (const c of svg.children) if (c.localName === "title" && c.textContent?.trim()) return true;
  return false;
}

/** aria-level, then h1–h6, then the ARIA default of 2. */
export function headingLevel(el: Element): number {
  const attr = parseInt(el.getAttribute("aria-level") ?? "", 10);
  if (attr >= 1) return attr;
  const m = /^h([1-6])$/.exec(el.localName);
  return m ? Number(m[1]) : 2;
}

/** Disabled: native :disabled (incl. fieldset inheritance) or aria-disabled. */
export function isDisabled(el: Element): boolean {
  try {
    if (el.matches(":disabled")) return true;
  } catch {
    /* ignore */
  }
  return !!el.closest('[aria-disabled="true"]');
}

export interface ElementStates {
  disabled: boolean;
  checked?: boolean | "mixed";
  expanded?: boolean;
  pressed?: boolean | "mixed";
  required?: boolean;
}

export function elementStates(el: Element, role: string): ElementStates {
  const s: ElementStates = { disabled: isDisabled(el) };
  const ac = el.getAttribute("aria-checked");
  if (role === "checkbox" || role === "radio" || role === "switch") {
    if (ac === "mixed") s.checked = "mixed";
    else if (ac !== null) s.checked = ac === "true";
    else if ("checked" in el) s.checked = (el as HTMLInputElement).checked;
  }
  const ae = el.getAttribute("aria-expanded");
  if (ae !== null) s.expanded = ae === "true";
  const ap = el.getAttribute("aria-pressed");
  if (ap !== null) s.pressed = ap === "mixed" ? "mixed" : ap === "true";
  if (el.getAttribute("aria-required") === "true" || (el as HTMLInputElement).required) s.required = true;
  return s;
}
