import { test as base, chromium, type BrowserContext, type Page, type Locator } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

const dist = path.resolve("dist");
const executablePath =
  process.env.CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

export const DEMO = "http://localhost:4321/test/fixtures/demo.html";

export const test = base.extend<{ context: BrowserContext; page: Page }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      ...(executablePath ? { executablePath } : { channel: "chromium" }),
      headless: !process.env.HEADED,
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    });
    await use(context);
    await context.close();
  },
  page: async ({ context }, use) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await use(page);
  },
});
export { expect } from "@playwright/test";

/** The overlay's shadow root content (it's an open shadow root). */
export function ui(page: Page): Locator {
  return page.locator("squarb-ui");
}

export async function label(page: Page): Promise<string> {
  return (await page.locator("squarb-ui .label.current").innerText()).replace(/\s+/g, " ").trim();
}

export async function keys(page: Page, seq: string): Promise<void> {
  for (const k of seq) await page.keyboard.press(k === "\\" ? "Backslash" : k);
}

export async function activeId(page: Page): Promise<string> {
  return page.evaluate(() => {
    let a: Element | null = document.activeElement;
    while (a?.shadowRoot?.activeElement) a = a.shadowRoot.activeElement;
    return a?.id || a?.localName || "";
  });
}
