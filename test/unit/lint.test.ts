import { describe, expect, it } from "vitest";
import { RoleIndex } from "../../src/content/a11y/index";
import { collectIssues, scanClickablesSync } from "../../src/content/a11y/lint";
import { setBody } from "./helpers";

describe("looks-clickable detection", () => {
  it("flags onclick / tabindex / pointer-cursor divs, not real controls", () => {
    setBody(`
      <div id=a onclick="go()">Fake button</div>
      <span id=b tabindex="0">Focusable span</span>
      <div id=c style="cursor:pointer">Pointer div<span>child inherits, not flagged</span></div>
      <button onclick="go()" style="cursor:pointer">Real button<span style="cursor:pointer">inner</span></button>
      <a href="#" onclick="x()">real link</a>
      <div id=card onclick="x()"><a href="/post">Card with a real link</a></div>
      <label style="cursor:pointer"><input type=checkbox> label</label>
      <div role="button" tabindex="0" onclick="x()">ARIA button</div>`);
    const ids = scanClickablesSync(document.documentElement).map((s) => `${s.el.id}:${s.reasons.join("+")}`);
    expect(ids).toEqual(["a:onclick", "b:tabindex", "c:cursor"]);
  });

  it("uses framework handler marks from the main-world probe", () => {
    setBody('<div id=r>React thing</div>');
    const el = document.getElementById("r")!;
    const s = scanClickablesSync(document.documentElement, new Map([[el, "React"]]));
    expect(s).toHaveLength(1);
    expect(s[0]!.framework).toBe("React");
  });
});

describe("page issues", () => {
  it("finds unnamed controls, heading skips and missing main", () => {
    setBody(`
      <h1>Title</h1>
      <h3>Skipped a level</h3>
      <button><svg><path d=""/></svg></button>
      <a href="/x"></a>
      <img src="x.png">
      <input type="text">
      <div onclick="x()">Fake</div>`);
    const idx = new RoleIndex();
    const issues = collectIssues(idx, scanClickablesSync(document.documentElement));
    const kinds = issues.map((i) => i.kind);
    expect(kinds.filter((k) => k === "unnamed")).toHaveLength(4);
    expect(kinds).toContain("heading-skip");
    expect(kinds).toContain("clickable");
    expect(kinds).toContain("no-main");
    expect(kinds).not.toContain("no-h1");
    idx.disconnect();
  });
});
