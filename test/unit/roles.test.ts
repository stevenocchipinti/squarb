import { beforeEach, describe, expect, it } from "vitest";
import { computeRole, headingLevel, isDisabled } from "../../src/content/a11y/roles";
import { matches, setBody } from "./helpers";

const role = (html: string) => {
  setBody(html);
  return computeRole(document.body.firstElementChild!);
};

describe("computeRole", () => {
  beforeEach(() => setBody(""));

  it.each([
    ["<button>x</button>", "button"],
    ['<input type="submit">', "button"],
    ['<input type="file">', "button"],
    ['<div role="button">x</div>', "button"],
    ["<summary>x</summary>", "button"],
    ['<a href="/x">x</a>', "link"],
    ["<a>no href</a>", null],
    ['<input type="text">', "textbox"],
    ["<input>", "textbox"],
    ['<input type="password">', "textbox"],
    ['<input type="search">', "searchbox"],
    ['<input type="email" list="l">', "combobox"],
    ['<input type="checkbox">', "checkbox"],
    ['<input type="range">', "slider"],
    ['<input type="number">', "spinbutton"],
    ['<input type="hidden">', null],
    ["<select><option>a</option></select>", "combobox"],
    ["<select multiple><option>a</option></select>", "listbox"],
    ["<textarea></textarea>", "textbox"],
    ['<div contenteditable="true">x</div>', "textbox"],
    ['<img src="x.png" alt="cat">', "img"],
    ['<img src="x.png" alt="">', null],
    ["<svg><circle r=1 /></svg>", null],
    ['<svg aria-label="Logo"></svg>', "img"],
    ["<svg><title>Logo</title></svg>", "img"],
    ["<ul><li>a</li></ul>", "list"],
    ["<nav></nav>", "navigation"],
    ["<main></main>", "main"],
    ["<header></header>", "banner"],
    ["<footer></footer>", "contentinfo"],
    ["<aside></aside>", "complementary"],
    ["<table></table>", "table"],
    ['<div role="grid"></div>', "grid"],
    ['<div role="none">x</div>', null],
  ])("%s → %s", (html, expected) => {
    expect(role(html)).toBe(expected);
  });

  it("header/footer inside sectioning content are not landmarks", () => {
    setBody("<article><header id=h></header><footer id=f></footer></article>");
    expect(computeRole(document.getElementById("h")!)).toBeNull();
    expect(computeRole(document.getElementById("f")!)).toBeNull();
  });

  it("list items lose semantics when the list is presentational", () => {
    setBody('<ul role="none"><li id=a>x</li></ul><ul><li id=b>y</li></ul>');
    expect(computeRole(document.getElementById("a")!)).toBeNull();
    expect(computeRole(document.getElementById("b")!)).toBe("listitem");
  });

  it("heading levels", () => {
    setBody('<h3 id=a>x</h3><div role="heading" aria-level="5" id=b>y</div><div role="heading" id=c>z</div>');
    expect(headingLevel(document.getElementById("a")!)).toBe(3);
    expect(headingLevel(document.getElementById("b")!)).toBe(5);
    expect(headingLevel(document.getElementById("c")!)).toBe(2);
  });

  it("disabled: native, fieldset and aria-disabled", () => {
    setBody(
      '<button id=a disabled>a</button><fieldset disabled><input id=b></fieldset><div aria-disabled="true"><div role="button" id=c>c</div></div><button id=d>d</button>',
    );
    expect(isDisabled(document.getElementById("a")!)).toBe(true);
    expect(isDisabled(document.getElementById("b")!)).toBe(true);
    expect(isDisabled(document.getElementById("c")!)).toBe(true);
    expect(isDisabled(document.getElementById("d")!)).toBe(false);
  });
});

describe("targets", () => {
  it("buttons: native, ARIA, toggle and menu buttons, with names", () => {
    setBody(`
      <button>Save</button>
      <div role="button" aria-label="Close"></div>
      <button aria-pressed="true">Bold</button>
      <button aria-haspopup="menu" aria-expanded="false">Options</button>
      <input type="submit" value="Send">
      <div class="btn" onclick="x()">Fake</div>`);
    expect(matches("button")).toEqual(["button:Save", "button:Close", "button:Bold", "button:Options", "button:Send"]);
  });

  it("headings any level and by level", () => {
    setBody('<h1>A</h1><h2>B</h2><div role="heading" aria-level="2">C</div><h3>D</h3>');
    expect(matches("heading")).toEqual(["heading1:A", "heading2:B", "heading2:C", "heading3:D"]);
    expect(matches("heading2")).toEqual(["heading2:B", "heading2:C"]);
  });

  it("form controls, text fields, combo boxes, radios", () => {
    setBody(`
      <label>Name <input></label>
      <label><input type="checkbox"> Remember</label>
      <label>Country <select><option>NZ</option></select></label>
      <fieldset><legend>Size</legend><label><input type="radio" name=s> S</label><label><input type="radio" name=s> M</label></fieldset>
      <label>Bio <textarea></textarea></label>
      <div role="switch" aria-checked="false" aria-label="Wifi"></div>
      <button>Not a field</button>`);
    expect(matches("formControl")).toEqual([
      "textbox:Name",
      "checkbox:Remember",
      "combobox:Country",
      "radio:S",
      "radio:M",
      "textbox:Bio",
      "switch:Wifi",
    ]);
    expect(matches("textField")).toEqual(["textbox:Name", "textbox:Bio"]);
    expect(matches("comboBox")).toEqual(["combobox:Country"]);
    expect(matches("radio")).toEqual(["radio:S", "radio:M"]);
  });

  it("landmarks: form/region only when named", () => {
    setBody(`
      <header>h</header>
      <nav aria-label="Primary">n</nav>
      <main>
        <section>unnamed section</section>
        <section aria-labelledby="t"><h2 id="t">Named</h2></section>
        <form>unnamed form</form>
        <form aria-label="Search site"></form>
      </main>
      <footer>f</footer>`);
    expect(matches("landmark")).toEqual([
      // banner/main/contentinfo don't take their name from content.
      "banner:",
      "navigation:Primary",
      "main:",
      "region:Named",
      "form:Search site",
      "contentinfo:",
    ]);
  });

  it("tables, lists, list items, images", () => {
    setBody(`
      <table><tr><td>1</td></tr></table>
      <div role="grid" aria-label="Data"></div>
      <ul><li>a</li><li>b</li></ul>
      <ol role="list"><li>c</li></ol>
      <img src="a.png" alt="A cat"><img src="b.png" alt=""><img src="c.png">`);
    expect(matches("table").map((s) => s.split(":")[0])).toEqual(["table", "grid"]);
    expect(matches("list")).toHaveLength(2);
    // listitem doesn't take its name from content either.
    expect(matches("listItem")).toEqual(["listitem:", "listitem:", "listitem:"]);
    expect(matches("graphic")).toEqual(["img:A cat", "img:"]);
  });
});
