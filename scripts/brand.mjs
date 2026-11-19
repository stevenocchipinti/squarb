// Generates the Squarb brand assets into brand/ and brand/out/.
//
//   brand/logo.svg            the mark (square brackets around a cursor dot)
//   brand/logo-16.svg         pixel-tuned mark for 16px
//   brand/wordmark*.svg       mark + outlined "squarb" lettering
//   brand/out/icons/*.png     extension icons (16, 32, 48, 128) + 512 master
//   brand/out/promo-*.png     Web Store promo tiles (rendered from HTML)
//
// Needs rsvg-convert for icons and Chromium for promo tiles.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import opentype from "opentype.js";

const C = {
  ink: "#16122e",
  ink2: "#2a2450",
  yellow: "#ffd23f",
  violet: "#7c5cff",
  violetSoft: "#b9a8ff",
  warn: "#ff7a29",
  paper: "#f7f6fc",
};

mkdirSync("brand/out/icons", { recursive: true });

// ---------------------------------------------------------------- the mark

const mark = ({ bg = C.ink, bracket = C.yellow, dot = C.violet, ring = true } = {}) => `
  <rect width="128" height="128" rx="30" fill="${bg}"/>
  <path d="M46 28H30v72h16" fill="none" stroke="${bracket}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M82 28h16v72H82" fill="none" stroke="${bracket}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
  ${ring ? `<circle cx="64" cy="64" r="19" fill="none" stroke="${dot}" stroke-opacity="0.45" stroke-width="4"/>` : ""}
  <circle cx="64" cy="64" r="11" fill="${dot}"/>`;

const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Squarb">${mark()}</svg>\n`;
writeFileSync("brand/logo.svg", logo);

// Flat, no ring: reads on light backgrounds as a solid badge.
writeFileSync(
  "brand/logo-flat.svg",
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Squarb">${mark({ ring: false })}</svg>\n`,
);

// 16px: thicker strokes on whole pixels, no ring.
const logo16 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" role="img" aria-label="Squarb">
  <rect width="16" height="16" rx="3.5" fill="${C.ink}"/>
  <path d="M6 3H4v10h2" fill="none" stroke="${C.yellow}" stroke-width="2" stroke-linecap="square"/>
  <path d="M10 3h2v10h-2" fill="none" stroke="${C.yellow}" stroke-width="2" stroke-linecap="square"/>
  <rect x="7" y="7" width="2" height="2" fill="${C.violetSoft}"/>
</svg>\n`;
writeFileSync("brand/logo-16.svg", logo16);

// ---------------------------------------------------------------- wordmark

const FONT_CANDIDATES = [
  "/usr/share/fonts/TTF/JetBrainsMonoNerdFont-ExtraBold.ttf",
  "/usr/share/fonts/TTF/JetBrainsMonoNerdFont-Bold.ttf",
  "/usr/share/fonts/TTF/JetBrainsMono-Bold.ttf",
];
const fontPath = FONT_CANDIDATES.find((p) => existsSync(p));

function wordmark(textColor, file) {
  if (!fontPath) {
    console.warn("No JetBrains Mono found; skipping wordmark");
    return;
  }
  const buf = readFileSync(fontPath);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const size = 84;
  const scale = size / font.unitsPerEm;
  // Glyph by glyph (monospace, no shaping needed; avoids unsupported GSUB lookups).
  const glyphs = [..."squarb"].map((ch) => font.charToGlyph(ch));
  const textW = glyphs.reduce((w, g) => w + g.advanceWidth * scale, 0);
  const gap = 30;
  const xHeight = (font.tables.os2.sxHeight || 550) * scale;
  const y = 64 + xHeight / 2;
  let x = 128 + gap;
  let d = "";
  for (const g of glyphs) {
    d += g.getPath(x, y, size).toPathData(2);
    x += g.advanceWidth * scale;
  }
  const w = Math.ceil(128 + gap + textW + 4);
  writeFileSync(
    file,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 128" role="img" aria-label="Squarb">${mark()}<path d="${d}" fill="${textColor}"/></svg>\n`,
  );
}
wordmark(C.ink, "brand/wordmark.svg");
wordmark("#ffffff", "brand/wordmark-on-dark.svg");

// ---------------------------------------------------------------- icons

const svgToPng = (svg, size, out) =>
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", out, svg]);

svgToPng("brand/logo-16.svg", 16, "brand/out/icons/icon-16.png");
svgToPng("brand/logo-flat.svg", 32, "brand/out/icons/icon-32.png");
svgToPng("brand/logo-flat.svg", 48, "brand/out/icons/icon-48.png");
svgToPng("brand/logo.svg", 128, "brand/out/icons/icon-128.png");
svgToPng("brand/logo.svg", 512, "brand/out/icons/icon-512.png");
console.log("icons → brand/out/icons");

// ---------------------------------------------------------------- promo tiles

if (process.argv.includes("--no-promo")) process.exit(0);

const { chromium } = await import("@playwright/test");
const executablePath = process.env.CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
const browser = await chromium.launch({ executablePath });
const logoInline = readFileSync("brand/logo.svg", "utf8");
const wordInline = existsSync("brand/wordmark-on-dark.svg") ? readFileSync("brand/wordmark-on-dark.svg", "utf8") : logoInline;

for (const [name, w, hgt] of [
  ["promo-small", 440, 280],
  ["promo-marquee", 1400, 560],
  ["social-card", 1200, 630],
]) {
  const tpl = readFileSync(`brand/templates/${name}.html`, "utf8")
    .replaceAll("{{LOGO}}", logoInline)
    .replaceAll("{{WORDMARK}}", wordInline);
  const page = await browser.newPage({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1 });
  await page.setContent(tpl, { waitUntil: "load" });
  await page.screenshot({ path: `brand/out/${name}.png` });
  await page.close();
  console.log(`${name} → brand/out/${name}.png`);
}
await browser.close();
