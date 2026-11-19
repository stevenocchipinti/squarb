import {
  DEFAULT_SETTINGS,
  findConflicts,
  loadSettings,
  saveSettings,
  type Settings,
} from "../shared/settings";
import { TARGETS } from "../shared/targets";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = $("status");

let settings: Settings = structuredClone(DEFAULT_SETTINGS);
let saveTimer = 0;

const PREFIXES: { key: "nextKey" | "prevKey" | "highlightKey" | "helpKey"; label: string; help: string }[] = [
  { key: "nextKey", label: "Next", help: "then a target key" },
  { key: "prevKey", label: "Previous", help: "then a target key" },
  { key: "highlightKey", label: "Highlight all", help: "twice opens the rotor" },
  { key: "helpKey", label: "Help", help: "shows the cheat sheet" },
];

function parseKeys(v: string): string[] | null {
  const parts = v.trim().split(/\s+/).filter(Boolean);
  return parts.every((p) => [...p].length === 1) ? parts : null;
}

function render(): void {
  const pre = $("prefixes");
  pre.replaceChildren();
  for (const p of PREFIXES) {
    const id = `p-${p.key}`;
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.innerHTML = `<label for="${id}">${p.label}</label><input id="${id}" type="text" maxlength="1" autocomplete="off" spellcheck="false" aria-describedby="${id}-d"><span id="${id}-d" class="muted">${p.help}</span>`;
    const input = wrap.querySelector("input")!;
    input.value = settings[p.key];
    input.addEventListener("input", () => {
      const v = input.value.trim();
      input.setAttribute("aria-invalid", String(v.length !== 1));
      if (v.length === 1) {
        settings[p.key] = v;
        queueSave();
      }
    });
    pre.append(wrap);
  }

  const body = $("targets");
  body.replaceChildren();
  for (const t of TARGETS) {
    const id = `t-${t.id}`;
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><label for="${id}">${t.plural[0]!.toUpperCase() + t.plural.slice(1)}</label></td><td><input id="${id}" type="text" autocomplete="off" spellcheck="false"></td><td class="muted">${t.origin} <code>${t.defaultKeys.join(" ")}</code></td>`;
    const input = tr.querySelector("input")!;
    input.value = (settings.targetKeys[t.id] ?? []).join(" ");
    input.addEventListener("input", () => {
      const keys = parseKeys(input.value);
      input.setAttribute("aria-invalid", String(keys === null));
      if (keys) {
        settings.targetKeys[t.id] = keys;
        queueSave();
      }
    });
    body.append(tr);
  }

  const timeout = $<HTMLInputElement>("timeout");
  timeout.value = String(settings.sequenceTimeoutMs);
  timeout.oninput = () => {
    const n = Number(timeout.value);
    const ok = n >= 200 && n <= 5000;
    timeout.setAttribute("aria-invalid", String(!ok));
    if (ok) {
      settings.sequenceTimeoutMs = n;
      queueSave();
    }
  };
  const warnings = $<HTMLInputElement>("warnings");
  warnings.checked = settings.showClickableWarnings;
  warnings.onchange = () => {
    settings.showClickableWarnings = warnings.checked;
    queueSave();
  };
}

function queueSave(): void {
  clearTimeout(saveTimer);
  const conflicts = findConflicts(settings);
  if (conflicts.length) {
    status.className = "status bad";
    status.textContent =
      "Not saved. " + conflicts.map((c) => `“${c.key}” is used by ${c.owners.join(" and ")}`).join("; ") + ".";
    return;
  }
  status.className = "status";
  status.textContent = "Saving…";
  saveTimer = window.setTimeout(async () => {
    await saveSettings(settings);
    status.textContent = "Saved.";
  }, 300);
}

$("reset").addEventListener("click", async () => {
  settings = structuredClone(DEFAULT_SETTINGS);
  await saveSettings(settings);
  render();
  status.className = "status";
  status.textContent = "Defaults restored.";
});

void loadSettings().then((s) => {
  settings = s;
  render();
});
