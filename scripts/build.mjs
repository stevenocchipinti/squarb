// Bundles the extension into dist/ (load it unpacked from there).
import * as esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");
const out = "dist";

rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/icons`, { recursive: true });

const common = {
  bundle: true,
  target: "chrome123",
  logLevel: "info",
  legalComments: "none",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
};

const builds = [
  { entryPoints: { content: "src/content/main.ts" }, format: "iife" },
  { entryPoints: { probe: "src/content/probe.ts" }, format: "iife" },
  { entryPoints: { background: "src/background/worker.ts" }, format: "esm" },
  { entryPoints: { options: "src/pages/options.ts" }, format: "esm" },
  // Test/benchmark harness: exposes the a11y core on window.__squarbBench.
  { entryPoints: { "bench-harness": "scripts/bench-harness.ts" }, format: "iife", outdir: "dist-bench" },
];

function copyStatic() {
  cpSync("src/manifest.json", `${out}/manifest.json`);
  for (const f of ["options.html", "options.css", "explain.html", "site.css"]) cpSync(`src/pages/${f}`, `${out}/${f}`);
  if (!existsSync("brand/out/icons")) {
    console.warn("brand/out/icons missing: run `npm run brand` first");
  } else {
    cpSync("brand/out/icons", `${out}/icons`, { recursive: true });
  }
}

copyStatic();
const ctxs = await Promise.all(
  builds.map((b) => esbuild.context({ ...common, outdir: out, ...b })),
);
if (watch) {
  await Promise.all(ctxs.map((c) => c.watch()));
  console.log("watching…");
} else {
  await Promise.all(ctxs.map((c) => c.rebuild()));
  await Promise.all(ctxs.map((c) => c.dispose()));
}
