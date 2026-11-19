import { RoleIndex, entryMatches, isNavigable, topModal } from "../../src/content/a11y/index";
import { accessibleName } from "../../src/content/a11y/names";
import type { TargetId } from "../../src/shared/targets";

export function setBody(html: string): void {
  document.body.innerHTML = html;
}

/** "role:name" for every navigable match of a target, in order. */
export function matches(target: TargetId, index = new RoleIndex()): string[] {
  const modal = topModal();
  const out = index
    .all()
    .filter((e) => entryMatches(e, target) && isNavigable(e, modal))
    .map((e) => `${e.role}${e.level ? e.level : ""}:${accessibleName(e.el)}`);
  return out;
}

export const tick = () => new Promise((r) => setTimeout(r, 0));
