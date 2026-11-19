// Exposes the accessibility core to Playwright tests and the benchmark,
// which can't reach into the content script's isolated world.
import { RoleIndex, entryMatches, isNavigable, topModal } from "../src/content/a11y/index";
import { accessibleName } from "../src/content/a11y/names";
import { scanClickablesSync, collectIssues } from "../src/content/a11y/lint";
import { TARGETS, type TargetId } from "../src/shared/targets";

declare global {
  interface Window {
    __squarbBench: unknown;
  }
}

window.__squarbBench = {
  run() {
    const t0 = performance.now();
    const index = new RoleIndex();
    const entries = index.all();
    const tBuild = performance.now() - t0;

    const t1 = performance.now();
    const modal = topModal();
    const counts: Record<string, number> = {};
    for (const t of TARGETS) counts[t.id] = entries.filter((e) => entryMatches(e, t.id as TargetId) && isNavigable(e, modal)).length;
    const tMatch = performance.now() - t1;

    // One jump = find first visible match + one name.
    const t2 = performance.now();
    const firstBtn = entries.find((e) => entryMatches(e, "button") && isNavigable(e, modal));
    if (firstBtn) accessibleName(firstBtn.el);
    const tJump = performance.now() - t2;

    // Rotor "Links" tab = names for every visible link.
    const t3 = performance.now();
    const links = entries.filter((e) => e.role === "link" && isNavigable(e, modal));
    for (const l of links) accessibleName(l.el);
    const tLinkNames = performance.now() - t3;

    const t4 = performance.now();
    const suspects = scanClickablesSync(document.documentElement);
    const tScan = performance.now() - t4;

    const t5 = performance.now();
    const issues = collectIssues(index, suspects);
    const tIssues = performance.now() - t5;

    // Incremental patch after a small DOM change.
    const div = document.createElement("div");
    div.innerHTML = "<button>Added</button><a href='#'>added link</a>";
    document.body.lastElementChild!.append(div);
    return new Promise((resolve) => {
      setTimeout(() => {
        const t6 = performance.now();
        const after = index.all().length;
        const tPatch = performance.now() - t6;
        index.disconnect();
        resolve({
          elements: document.getElementsByTagName("*").length,
          entries: entries.length,
          after,
          counts,
          suspects: suspects.length,
          issues: issues.length,
          ms: {
            buildIndex: +tBuild.toFixed(1),
            matchAllTargets: +tMatch.toFixed(1),
            firstJump: +tJump.toFixed(2),
            allLinkNames: +tLinkNames.toFixed(1),
            clickableScan: +tScan.toFixed(1),
            issues: +tIssues.toFixed(1),
            patchAfterMutation: +tPatch.toFixed(2),
          },
        });
      }, 0);
    });
  },
  /** Names + roles for a target, for cross-checking against Chrome's AX tree. */
  list(target: TargetId) {
    const index = new RoleIndex();
    const modal = topModal();
    const out = index
      .all()
      .filter((e) => entryMatches(e, target) && isNavigable(e, modal))
      .map((e) => ({ role: e.role, name: accessibleName(e.el), level: e.level ?? null }));
    index.disconnect();
    return out;
  },
};
