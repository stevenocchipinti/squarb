import { activeId, DEMO, expect, keys, label, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto(DEMO);
  await page.waitForFunction(() => !!document.querySelector("acme-promo")?.shadowRoot);
});

test("]b walks buttons in flat-tree order, through shadow DOM and iframes", async ({ page }) => {
  await keys(page, "]b");
  await expect.poll(() => label(page)).toBe("button (unnamed) Why?");
  const seen: string[] = [];
  for (let i = 0; i < 5; i++) {
    await keys(page, "]]");
    seen.push(await label(page));
  }
  expect(seen).toEqual([
    "button Back",
    "button Place order",
    "button Join",
    "button Start chat",
    "button (unnamed) Why?", // wrapped
  ]);
  await expect(page.locator("squarb-ui .toast")).toHaveText("Wrapped to top");
});

test("[b goes backwards; [[ repeats", async ({ page }) => {
  await keys(page, "]b]]]]"); // unnamed cart, Back, Place order
  expect(await label(page)).toBe("button Place order");
  await keys(page, "[b");
  expect(await label(page)).toBe("button Back");
  await keys(page, "[[");
  expect(await label(page)).toBe("button (unnamed) Why?");
});

test("headings by level, landmarks, links (incl. sr-only skip link)", async ({ page }) => {
  await keys(page, "]1");
  expect(await label(page)).toBe("heading 1 Checkout");
  await keys(page, "]2");
  expect(await label(page)).toBe("heading 2 Shipping details");
  await keys(page, "]4");
  expect(await label(page)).toBe("heading 4 Totals");
  await page.keyboard.press("Escape");
  await page.evaluate(() => scrollTo(0, 0));
  await keys(page, "]l");
  expect(await label(page)).toBe("link Skip to content visually hidden");
  await keys(page, "]d");
  expect(await label(page)).toBe("banner “Acme Outfitters Shop Sale Help”");
  await keys(page, "]]");
  expect(await label(page)).toBe("navigation Primary");
});

test("highlight, not focus: jumping to a text field doesn't steal keys; Enter focuses", async ({ page }) => {
  await keys(page, "]e");
  expect(await label(page)).toBe("textbox Full name");
  expect(await activeId(page)).toBe("body");
  await keys(page, "]e"); // still navigating, not typing
  expect(await label(page)).toBe("textbox Email");
  await page.keyboard.press("Enter");
  expect(await activeId(page)).toBe("email");
  // Now typing goes into the field, including ] and b.
  await page.keyboard.type("a]b");
  await expect(page.locator("#email")).toHaveValue("a]b");
  // Esc leaves the field so navigation works again.
  await page.keyboard.press("Escape");
  await expect.poll(() => activeId(page)).toBe("body");
  await keys(page, "]b");
  await expect(page.locator("squarb-ui .label.current")).toBeVisible();
});

test("Enter twice on a button: focus, then activate", async ({ page }) => {
  await page.evaluate(() => {
    document.getElementById("back")!.addEventListener("click", () => ((window as any).clicked = true));
  });
  await keys(page, "]b]]");
  expect(await label(page)).toBe("button Back");
  await page.keyboard.press("Enter");
  expect(await activeId(page)).toBe("back");
  expect(await page.evaluate(() => (window as any).clicked)).toBeFalsy();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => (window as any).clicked)).toBe(true);
});

test("never intercepts while typing in a field", async ({ page }) => {
  await page.locator("#notes").click();
  await page.keyboard.type("[x]\\\\?");
  await expect(page.locator("#notes")).toHaveValue("[x]\\\\?");
  await expect(page.locator("squarb-ui .label")).toHaveCount(0);
});

test("modifier combos pass through to the page", async ({ page }) => {
  await page.evaluate(() => {
    (window as any).got = [];
    addEventListener("keydown", (e) => (window as any).got.push(e.key));
  });
  await page.keyboard.press("Control+]");
  await page.keyboard.press("x");
  expect(await page.evaluate(() => (window as any).got)).toEqual(["Control", "]", "x"]);
});

test("consumed keys don't reach page shortcuts", async ({ page }) => {
  await page.evaluate(() => {
    (window as any).got = [];
    document.addEventListener("keydown", (e) => (window as any).got.push(e.key));
  });
  await keys(page, "]h");
  expect(await page.evaluate(() => (window as any).got)).toEqual([]);
});

test("\\b highlights all buttons; bare ] steps; Esc clears", async ({ page }) => {
  await keys(page, "\\b");
  await expect(page.locator("squarb-ui .toast")).toContainText("5 buttons (1 unnamed)");
  await expect.poll(() => page.locator("squarb-ui .ring.all").count()).toBeGreaterThanOrEqual(3);
  await keys(page, "]");
  await expect(page.locator("squarb-ui .label.current")).toBeVisible();
  await keys(page, "]");
  const second = await label(page);
  expect(second).toMatch(/^button /);
  await page.keyboard.press("Escape");
  await expect(page.locator("squarb-ui .ring.all")).toHaveCount(0);
  await expect(page.locator("squarb-ui .label.current")).toBeHidden();
});

test("]b over a clickable div flashes a warning", async ({ page }) => {
  await keys(page, "]b]]"); // Back
  await page.waitForTimeout(1500); // background clickable scan
  await keys(page, "]]"); // Place order, passing the fake coupon "button"
  await expect(page.locator("squarb-ui .label.warn")).toContainText("Looks clickable (has an onclick handler) but has no button role");
});

test("]B also stops on look-alike buttons, and Enter clicks them", async ({ page }) => {
  await keys(page, "]b]]"); // Back
  expect(await label(page)).toBe("button Back");
  await keys(page, "]B");
  await expect(page.locator("squarb-ui .label.current.fake")).toBeVisible();
  expect(await label(page)).toBe("div, not a button Apply coupon Enter clicks Why?");
  await page.keyboard.press("Enter");
  await expect(page.locator("#coupon")).toHaveText("Coupon applied");
  await expect(page.locator("squarb-ui .toast")).toContainText("Squarb clicked it for you");
  // ]] keeps the loose mode; plain ]b skips the fake again.
  await keys(page, "]]");
  expect(await label(page)).toBe("button Place order");
  await keys(page, "[b");
  expect(await label(page)).toBe("button Back");
});

test("\\B highlights buttons plus look-alikes", async ({ page }) => {
  await keys(page, "\\B");
  await expect(page.locator("squarb-ui .toast")).toContainText("5 buttons (1 unnamed, + 1 look-alike)");
  await expect.poll(() => page.locator("squarb-ui .ring.all.fake").count()).toBe(1);
});

test("choosing a look-alike in the rotor puts the cursor on it", async ({ page }) => {
  await keys(page, "\\\\");
  await page.locator("squarb-ui [role=tab]", { hasText: "Issues" }).click();
  await page.locator("squarb-ui [role=option]", { hasText: "Looks clickable" }).click();
  await expect(page.locator("squarb-ui .label.current.fake")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#coupon")).toHaveText("Coupon applied");
});

test("rotor lists elements by role, filters, and jumps", async ({ page }) => {
  await keys(page, "\\\\");
  const rotor = page.locator('squarb-ui [role="dialog"]');
  await expect(rotor).toBeVisible();
  await expect(page.locator('squarb-ui [role="tab"][aria-selected="true"]')).toContainText("Headings");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('squarb-ui [role="tab"][aria-selected="true"]')).toContainText("Buttons");
  await expect(page.locator('squarb-ui [role="option"]')).toHaveCount(5);
  await expect(page.locator('squarb-ui [role="option"]').first()).toContainText("(unnamed)");
  await page.keyboard.type("place");
  await expect(page.locator('squarb-ui [role="option"]')).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(rotor).toHaveCount(0);
  expect(await label(page)).toBe("button Place order");
});

test("rotor Issues tab explains problems", async ({ page }) => {
  await keys(page, "\\\\");
  await page.keyboard.press("ArrowLeft"); // wraps to Issues
  const items = page.locator('squarb-ui [role="option"]');
  await expect(items.filter({ hasText: "button has no accessible name" })).toHaveCount(1);
  await expect(items.filter({ hasText: "img has no accessible name" })).toHaveCount(1);
  await expect(items.filter({ hasText: "Looks clickable" })).toHaveCount(1);
  await expect(items.filter({ hasText: "Heading level jumps from 2 to 4" })).toHaveCount(1);
});

test("? shows help with VoiceOver equivalents", async ({ page }) => {
  await keys(page, "?");
  const help = page.locator('squarb-ui [aria-label="Squarb keyboard shortcuts"]');
  await expect(help).toContainText("Now test it in VoiceOver");
  await expect(help).toContainText("Quick Nav B / Shift-B");
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
});
