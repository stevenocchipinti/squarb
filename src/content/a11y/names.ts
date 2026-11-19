import { computeAccessibleName } from "dom-accessibility-api";

/**
 * Accessible names are the expensive part (they walk subtrees and follow
 * aria-labelledby), so they're computed only for elements we actually show
 * and cached per mutation "generation": any DOM change bumps the generation
 * and invalidates every cached name at once.
 */

let generation = 0;
const cache = new WeakMap<Element, { gen: number; name: string }>();

const supportsPseudo =
  typeof navigator !== "undefined" && !/jsdom/i.test(navigator.userAgent ?? "");

export function bumpNameGeneration(): void {
  generation++;
}

export function accessibleName(el: Element): string {
  const hit = cache.get(el);
  if (hit && hit.gen === generation) return hit.name;
  let name = "";
  try {
    name = computeAccessibleName(el, { computedStyleSupportsPseudoElements: supportsPseudo })
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    name = "";
  }
  cache.set(el, { gen: generation, name });
  return name;
}

export function truncate(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

/**
 * What to show in a label: the accessible name, or for roles that don't take
 * a name from content (list items, landmarks, lists) a snippet of their text
 * so the label isn't blank. Never used to decide "unnamed".
 */
export function displayName(el: Element, name: string, nameRequired: boolean): string {
  if (name || nameRequired) return name;
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return text ? `“${truncate(text, 60)}”` : "";
}
