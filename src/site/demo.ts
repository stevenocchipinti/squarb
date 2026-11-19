/**
 * Runs the real Squarb controller on the project website, so visitors can
 * try the keys without installing anything. If the extension is installed,
 * its content script registers first and consumes the keys, so the two never
 * both react.
 */
import "../content/probe";
import { Controller } from "../content/controller";

const go = (hash: string) => {
  location.hash = hash;
};

const controller = new Controller(document, {
  openOptions: () => go("#install"),
  openExplainer: () => go("#nudges"),
});

// Warm the index and the clickable scan so the first ]b already shows warnings.
addEventListener("load", () => controller.warmUp());

// Buttons on the page that run an action, for people reading on a phone.
document.addEventListener("click", (e) => {
  const t = (e.target as Element).closest<HTMLElement>("[data-try]");
  if (!t) return;
  const seq = t.dataset.try!;
  for (const key of seq) {
    window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }
});

// Fill in GitHub links when hosted at <owner>.github.io/<repo>/.
const m = /^([^.]+)\.github\.io$/.exec(location.hostname);
const repo = location.pathname.split("/").filter(Boolean)[0];
if (m && repo) {
  const url = `https://github.com/${m[1]}/${repo}`;
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[data-repo]")) {
    a.href = url + (a.dataset.repo || "");
  }
}

(window as unknown as { squarbDemo: Controller }).squarbDemo = controller;
