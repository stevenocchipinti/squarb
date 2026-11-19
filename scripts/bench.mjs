// Benchmark the a11y core on a large synthetic page (GitHub-diff-sized), or on
// any URLs you pass: `npm run bench -- https://en.wikipedia.org/wiki/Web_accessibility`
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const urls = process.argv.slice(2);
const executablePath = process.env.CHROMIUM_PATH || (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);

function syntheticPage({ files = 40, linesPerFile = 400 } = {}) {
  // ~ a big PR diff: lots of spans per line, a few buttons per file, a sidebar of links.
  let html = "<header><nav aria-label=Main>";
  for (let i = 0; i < 60; i++) html += `<a href="/n${i}">Nav ${i}</a>`;
  html += "</nav></header><main><h1>Pull request #1234</h1>";
  for (let f = 0; f < files; f++) {
    html += `<section aria-labelledby="f${f}"><h2 id="f${f}">src/file${f}.ts</h2>`;
    html += `<button>Viewed</button><button aria-label="Expand all">⇕</button><div class="menu" onclick="x()">⋯</div>`;
    html += "<table role=presentation><tbody>";
    for (let l = 0; l < linesPerFile; l++) {
      html += `<tr><td><a href="#L${f}-${l}">${l}</a></td><td><span class=k>const</span> <span class=v>x${l}</span> = <span class=n>${l}</span>; <span class=c>// comment</span></td></tr>`;
    }
    html += "</tbody></table></section>";
  }
  html += "</main><footer>footer</footer>";
  return `<!doctype html><html><head><title>bench</title></head><body>${html}</body></html>`;
}

const server = spawn(process.execPath, ["scripts/serve.mjs"], { env: { ...process.env, PORT: "4399" }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 400));

const browser = await chromium.launch({ executablePath });
const results = [];
try {
  const targets = urls.length ? urls : ["synthetic"];
  for (const url of targets) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    if (url === "synthetic") await page.setContent(syntheticPage());
    else await page.goto(url, { waitUntil: "load", timeout: 60_000 });
    await page.addScriptTag({ path: "dist-bench/bench-harness.js" });
    // Warm-up run (JIT), then the measured run.
    await page.evaluate(() => window.__squarbBench.run());
    const r = await page.evaluate(() => window.__squarbBench.run());
    results.push({ url, ...r });
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}

for (const r of results) {
  console.log(`\n${r.url}`);
  console.log(`  ${r.elements.toLocaleString()} elements → ${r.entries.toLocaleString()} indexed (${r.counts.button} buttons, ${r.counts.link} links, ${r.counts.heading} headings)`);
  console.log(`  ${r.suspects} looks-clickable, ${r.issues} issues`);
  for (const [k, v] of Object.entries(r.ms)) console.log(`  ${k.padEnd(20)} ${String(v).padStart(8)} ms`);
}
