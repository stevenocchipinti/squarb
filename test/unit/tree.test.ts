import { describe, expect, it } from "vitest";
import { RoleIndex } from "../../src/content/a11y/index";
import { compareFlat } from "../../src/content/a11y/tree";
import { matches, setBody, tick } from "./helpers";

describe("exclusion and visibility", () => {
  it("skips aria-hidden, inert, hidden, display:none, visibility:hidden, closed dialogs", () => {
    setBody(`
      <button>visible</button>
      <div aria-hidden="true"><button>aria-hidden</button></div>
      <div inert><button>inert</button></div>
      <div hidden><button>hidden attr</button></div>
      <div style="display:none"><button>display none</button></div>
      <button style="visibility:hidden">visibility hidden</button>
      <dialog><button>closed dialog</button></dialog>
      <details><summary>Summary</summary><button>in closed details</button></details>
      <button aria-hidden="false">explicitly not hidden</button>`);
    expect(matches("button")).toEqual(["button:visible", "button:Summary", "button:explicitly not hidden"]);
  });

  it("keeps visually hidden (sr-only) content, like a screen reader does", () => {
    setBody(`
      <style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}</style>
      <a class="sr-only" href="#main">Skip to content</a>
      <a href="/">Home</a>`);
    expect(matches("link")).toEqual(["link:Skip to content", "link:Home"]);
  });

  it("restricts to an open modal dialog", () => {
    setBody(`
      <button>outside</button>
      <div role="dialog" aria-modal="true"><button>inside</button></div>`);
    expect(matches("button")).toEqual(["button:inside"]);
  });

  it("marks disabled controls but still navigates to them", () => {
    setBody('<button disabled>Off</button><button>On</button>');
    expect(matches("button")).toEqual(["button:Off", "button:On"]);
  });
});

describe("shadow DOM and frames", () => {
  it("walks open shadow roots in flat-tree order, including slotted content", () => {
    setBody('<button>before</button><x-card id=host><button slot="action">slotted</button></x-card><button>after</button>');
    const host = document.getElementById("host")!;
    const sr = host.attachShadow({ mode: "open" });
    sr.innerHTML = '<button>shadow first</button><slot name="action"></slot><button>shadow last</button>';
    expect(matches("button")).toEqual([
      "button:before",
      "button:shadow first",
      "button:slotted",
      "button:shadow last",
      "button:after",
    ]);
  });

  it("compareFlat orders shadow content between its host's neighbours", () => {
    setBody("<p id=a></p><div id=host></div><p id=b></p>");
    const sr = document.getElementById("host")!.attachShadow({ mode: "open" });
    sr.innerHTML = "<span id=inner></span>";
    const inner = sr.getElementById("inner")!;
    expect(compareFlat(document.getElementById("a")!, inner)).toBeLessThan(0);
    expect(compareFlat(inner, document.getElementById("b")!)).toBeLessThan(0);
    expect(compareFlat(document.getElementById("host")!, inner)).toBeLessThan(0);
  });

  it("inlines same-origin iframes", () => {
    setBody('<button>top</button><iframe id=f></iframe><button>bottom</button>');
    const f = document.getElementById("f") as HTMLIFrameElement;
    f.contentDocument!.body.innerHTML = "<button>in frame</button>";
    expect(matches("button")).toEqual(["button:top", "button:in frame", "button:bottom"]);
  });
});

describe("incremental updates", () => {
  it("patches only changed subtrees", async () => {
    setBody('<div id=a><button>one</button></div><div id=b><button>two</button></div>');
    const idx = new RoleIndex();
    expect(matches("button", idx)).toEqual(["button:one", "button:two"]);
    const before = idx.getStats().fullBuilds;

    document.getElementById("b")!.insertAdjacentHTML("beforeend", "<button>three</button>");
    document.getElementById("a")!.insertAdjacentHTML("afterbegin", "<button>zero</button>");
    await tick();
    expect(matches("button", idx)).toEqual(["button:zero", "button:one", "button:two", "button:three"]);
    expect(idx.getStats().fullBuilds).toBe(before);
    expect(idx.getStats().patches).toBeGreaterThan(0);

    document.getElementById("a")!.remove();
    await tick();
    expect(matches("button", idx)).toEqual(["button:two", "button:three"]);

    document.getElementById("b")!.setAttribute("aria-hidden", "true");
    await tick();
    expect(matches("button", idx)).toEqual([]);

    document.getElementById("b")!.removeAttribute("aria-hidden");
    await tick();
    expect(matches("button", idx)).toEqual(["button:two", "button:three"]);
    idx.disconnect();
  });

  it("picks up role changes and renamed elements", async () => {
    setBody('<div id=x>Save</div><button id=y>Old</button>');
    const idx = new RoleIndex();
    expect(matches("button", idx)).toEqual(["button:Old"]);
    document.getElementById("x")!.setAttribute("role", "button");
    document.getElementById("y")!.textContent = "New";
    await tick();
    expect(matches("button", idx)).toEqual(["button:Save", "button:New"]);
    idx.disconnect();
  });
});
