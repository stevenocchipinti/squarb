import { DEMO, expect, test } from "./fixtures";

/**
 * Cross-check our computed roles/names against Chrome's real accessibility
 * tree (CDP, tests only). Runs the same a11y core via the bench harness in
 * the page, then compares with Accessibility.queryAXTree.
 */
for (const [target, role] of [
  ["button", "button"],
  ["link", "link"],
  ["heading", "heading"],
  ["textField", "textbox"],
] as const) {
  test(`roles + names match Chrome's AX tree: ${target}`, async ({ page }) => {
    await page.goto(DEMO);
    await page.addScriptTag({ path: "dist-bench/bench-harness.js" });
    const ours: { role: string; name: string }[] = await page.evaluate(
      (t) => (window as any).__squarbBench.list(t),
      target,
    );

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Accessibility.enable");
    const { root: node } = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
    const all: { name: string }[] = [];
    // queryAXTree is per-document; include the same-origin iframe's document too.
    const docs = [node.nodeId];
    const findFrames = (n: any) => {
      if (n.contentDocument) docs.push(n.contentDocument.nodeId);
      for (const c of [...(n.children ?? []), ...(n.shadowRoots ?? [])]) findFrames(c);
    };
    findFrames(node);
    for (const nodeId of docs) {
      const { nodes } = await cdp.send("Accessibility.queryAXTree", { nodeId, role });
      for (const n of nodes) if (!n.ignored) all.push({ name: String(n.name?.value ?? "") });
    }
    const chromeNames = all.map((n) => n.name).sort();
    const ourNames = ours.filter((o) => o.role === role).map((o) => o.name).sort();
    expect(ourNames).toEqual(chromeNames);
  });
}
