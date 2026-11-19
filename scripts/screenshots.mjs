// Captures Web Store screenshots (1280×800) of the real extension on the demo page.
// Run `npm run build` first.
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const dist = path.resolve("dist");
const executablePath = process.env.CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const out = "brand/out/screenshots";
mkdirSync(out, { recursive: true });

const server = spawn(process.execPath, ["scripts/serve.mjs"], { env: { ...process.env, PORT: "4398" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 400));
const DEMO = "http://localhost:4398/test/fixtures/demo.html";

async function shoot(name, colorScheme, steps, clip) {
  const ctx = await chromium.launchPersistentContext("", {
    executablePath,
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme,
    reducedMotion: "reduce",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(DEMO);
  await page.waitForFunction(() => !!document.querySelector("acme-promo")?.shadowRoot);
  await page.waitForTimeout(200);
  for (const s of steps) {
    if (typeof s === "number") await page.waitForTimeout(s);
    else if (typeof s === "function") await s(page);
    else if (Array.isArray(s)) for (const k of s) await page.keyboard.press(k);
    else for (const k of s) await page.keyboard.press(k === "\\" ? "Backslash" : k);
  }
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${out}/${name}.png`, ...(clip ? { clip } : {}) });
  await ctx.close();
  console.log(`${name} → ${out}/${name}.png`);
}

try {
  await shoot("1-jump-to-button", "light", ["]b]]]]"]);
  await shoot("2-clickable-warning", "light", ["]b]]", 1600, "]]"]);
  await shoot("3-highlight-all", "light", ["\\j", 300, "]"]);
  await shoot("4-rotor-dark", "dark", ["\\\\", 200, ["ArrowRight", "ArrowRight"]]);
  await shoot("5-issues", "light", ["]b", 1600, ["Escape"], "\\\\", 200, ["ArrowLeft"]]);
  await shoot("6-help", "dark", ["?"]);
  // Close-up for the website hero.
  await shoot("hero-closeup", "light", ["]b]]", 1600, "]]"], { x: 182, y: 410, width: 620, height: 390 });
} finally {
  server.kill();
}
