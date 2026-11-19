// Builds the GitHub Pages site in docs/: bundles the live demo and copies
// brand assets. Commit docs/ and set Pages to "Deploy from branch → /docs".
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";

mkdirSync("docs/assets/screens", { recursive: true });
await esbuild.build({
  entryPoints: { "squarb-demo": "src/site/demo.ts" },
  outdir: "docs/assets",
  bundle: true,
  format: "iife",
  target: "chrome123",
  minify: true,
  legalComments: "none",
});
for (const f of ["logo.svg", "wordmark.svg", "wordmark-on-dark.svg"]) cpSync(`brand/${f}`, `docs/assets/${f}`);
cpSync("brand/out/social-card.png", "docs/assets/social-card.png");
cpSync("brand/out/icons/icon-32.png", "docs/assets/favicon-32.png");
cpSync("brand/out/icons/icon-128.png", "docs/assets/icon-128.png");
for (const f of readdirSync("brand/out/screenshots")) cpSync(`brand/out/screenshots/${f}`, `docs/assets/screens/${f}`);
// Serve files as-is (no Jekyll processing).
writeFileSync("docs/.nojekyll", "");
console.log("site → docs/");
