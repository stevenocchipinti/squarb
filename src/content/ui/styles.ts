/**
 * All Squarb UI lives in one shadow root, so page CSS can't reach in and ours
 * can't leak out. The highlight ring is two-tone (ink + yellow) so it holds
 * 3:1+ contrast on white, black and anything in between.
 */
export const CSS = /* css */ `
:host {
  all: initial;
  color-scheme: light dark;
  --ink: #16122e;
  --ink-2: #2a2450;
  --yellow: #ffd23f;
  --violet: #7c5cff;
  --violet-soft: #b9a8ff;
  --warn: #ff7a29;
  --white: #ffffff;
  --panel-bg: light-dark(#ffffff, #1b1736);
  --panel-fg: light-dark(#16122e, #f2efff);
  --panel-muted: light-dark(#5b5677, #a9a3c9);
  --panel-line: light-dark(#e4e0f5, #36305e);
  --panel-hover: light-dark(#f1eeff, #2a2450);
  --panel-accent: light-dark(#5a3df0, #b9a8ff);
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  font: 13px/1.4 var(--font);
}

[hidden] { display: none !important; }
.layer { position: fixed; inset: 0; pointer-events: none; overflow: hidden; }

/* ---------------------------------------------------------------- rings */

.ring {
  position: fixed;
  box-sizing: border-box;
  border: 3px solid var(--yellow);
  outline: 2px solid var(--ink);
  outline-offset: 0;
  box-shadow: inset 0 0 0 1px var(--ink), 0 0 0 5px rgb(255 210 63 / 0.25);
  border-radius: 6px;
  pointer-events: none;
}
.ring.current {
  @media (prefers-reduced-motion: no-preference) {
    transition: translate 140ms cubic-bezier(.2,.8,.2,1), width 140ms cubic-bezier(.2,.8,.2,1), height 140ms cubic-bezier(.2,.8,.2,1);
  }
}
.ring.hidden-target { border-style: dashed; }
.ring.unnamed { border-color: var(--warn); box-shadow: inset 0 0 0 1px var(--ink), 0 0 0 5px rgb(255 122 41 / 0.28); }
.ring.all {
  border-width: 2px;
  border-color: var(--violet-soft);
  outline-width: 1px;
  box-shadow: none;
  border-radius: 4px;
}
.ring.all.unnamed { border-color: var(--warn); }
.ring.warn {
  border: 2px dashed var(--warn);
  outline: 1px solid var(--ink);
  box-shadow: none;
  @media (prefers-reduced-motion: no-preference) {
    animation: warn-in 220ms ease-out;
  }
}
.ring.warn.fading { opacity: 0; transition: opacity 400ms ease-in; }
@keyframes warn-in { from { opacity: 0; } to { opacity: 1; } }

.badge {
  position: fixed;
  min-width: 16px;
  padding: 0 4px;
  box-sizing: border-box;
  border-radius: 4px;
  background: var(--ink);
  color: var(--violet-soft);
  font: 600 10px/16px var(--mono);
  text-align: center;
}

/* ---------------------------------------------------------------- labels */

.label {
  position: fixed;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: min(520px, calc(100vw - 16px));
  padding: 4px 8px;
  box-sizing: border-box;
  border-radius: 6px;
  background: var(--ink);
  color: var(--white);
  border: 1px solid var(--ink-2);
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.28);
  font: 500 13px/1.3 var(--font);
  white-space: nowrap;
  pointer-events: auto;
}
.label .role { color: var(--yellow); font: 600 12px/1.3 var(--mono); }
.label .name { overflow: hidden; text-overflow: ellipsis; }
.label .name.missing { color: #ffb38a; font-style: italic; }
.label .tag {
  padding: 0 5px;
  border-radius: 999px;
  background: var(--ink-2);
  color: var(--violet-soft);
  font: 600 10px/16px var(--font);
}
.label .tag.warn { background: var(--warn); color: var(--ink); }
.label.warn, .label.unnamed, .label.fake { background: #2b1606; border-color: var(--warn); }
.label.warn .role, .label.unnamed .role, .label.fake .role { color: var(--warn); }
.ring.fake { border-style: dashed; border-color: var(--warn); }
.label.fading { opacity: 0; transition: opacity 400ms ease-in; }
.label a, .label button.why {
  all: unset;
  cursor: pointer;
  color: var(--violet-soft);
  text-decoration: underline;
  font-weight: 600;
}
.label a:focus-visible, .label button.why:focus-visible { outline: 2px solid var(--yellow); outline-offset: 2px; }

/* ---------------------------------------------------------------- toast / chip */

.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  translate: -50% 0;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--ink);
  color: var(--white);
  border: 1px solid var(--ink-2);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
  font: 500 13px/1.3 var(--font);
  white-space: nowrap;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 1;
  transition: opacity 200ms;
}
.toast.gone { opacity: 0; }
.toast kbd, .chip kbd, .panel kbd {
  font: 600 11px/1 var(--mono);
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--ink-2);
  color: var(--yellow);
}
.chip {
  position: fixed;
  right: 16px;
  bottom: 16px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--ink);
  color: var(--white);
  font: 600 13px/1 var(--mono);
  box-shadow: 0 4px 14px rgb(0 0 0 / 0.25);
}
.chip .dots { color: var(--violet-soft); }

/* ---------------------------------------------------------------- panels */

.scrim {
  position: fixed;
  inset: 0;
  background: rgb(10 8 24 / 0.45);
  pointer-events: auto;
  display: grid;
  place-items: start center;
  padding: 8vh 16px 16px;
  box-sizing: border-box;
}
.panel {
  width: min(720px, 100%);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  background: var(--panel-bg);
  color: var(--panel-fg);
  border: 1px solid var(--panel-line);
  box-shadow: 0 24px 60px rgb(0 0 0 / 0.35);
  overflow: hidden;
  font: 14px/1.45 var(--font);
  @media (prefers-reduced-motion: no-preference) {
    animation: panel-in 160ms cubic-bezier(.2,.8,.2,1);
  }
}
@keyframes panel-in { from { opacity: 0; translate: 0 -8px; } to { opacity: 1; translate: 0 0; } }
.panel header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--panel-line);
}
.panel header .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; letter-spacing: 0.01em; }
.panel header .brand svg { width: 22px; height: 22px; display: block; }
.panel header .hint { margin-left: auto; color: var(--panel-muted); font-size: 12px; }
.panel .body { overflow: auto; padding: 4px 0 12px; }
.panel :focus-visible { outline: 2px solid var(--panel-accent); outline-offset: 2px; }
.panel:focus { outline: none; }

/* rotor */
.tabs { display: flex; gap: 4px; padding: 8px 12px 0; overflow-x: auto; scrollbar-width: thin; }
.tab {
  all: unset;
  flex: none;
  padding: 6px 10px;
  border-radius: 8px 8px 0 0;
  color: var(--panel-muted);
  font: 600 13px/1.2 var(--font);
  cursor: pointer;
  border-bottom: 2px solid transparent;
}
.tab[aria-selected="true"] { color: var(--panel-fg); border-bottom-color: var(--panel-accent); }
.tab .count { margin-left: 5px; font: 500 11px/1 var(--mono); color: var(--panel-muted); }
.tab .count.warn { color: var(--warn); }
.search {
  margin: 10px 16px 6px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--panel-line);
  background: light-dark(#faf9ff, #14112b);
  color: var(--panel-fg);
  font: 14px/1.2 var(--font);
  outline: none;
}
.search:focus { border-color: var(--panel-accent); box-shadow: 0 0 0 3px light-dark(#e6e0ff, #2f2860); }
.items { list-style: none; margin: 0; padding: 0 8px; }
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  min-width: 0;
}
.item[aria-selected="true"] { background: var(--panel-hover); box-shadow: inset 3px 0 0 var(--panel-accent); }
.item .r { flex: none; min-width: 84px; font: 600 11px/1.2 var(--mono); color: var(--panel-muted); }
.item .n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item .n.missing { color: var(--warn); font-style: italic; }
.item .t { flex: none; margin-left: auto; font-size: 11px; color: var(--panel-muted); }
.item .t.warn { color: var(--warn); font-weight: 600; }
.item.indent-2 .n { padding-left: 12px; } .item.indent-3 .n { padding-left: 24px; }
.item.indent-4 .n { padding-left: 36px; } .item.indent-5 .n { padding-left: 48px; }
.item.indent-6 .n { padding-left: 60px; }
.empty { padding: 16px; color: var(--panel-muted); }
.more { padding: 8px 16px; color: var(--panel-muted); font-size: 12px; }
.footer { display: flex; gap: 14px; flex-wrap: wrap; padding: 8px 16px; border-top: 1px solid var(--panel-line); color: var(--panel-muted); font-size: 12px; }
.footer kbd { background: var(--panel-hover); color: var(--panel-fg); }

/* help */
.help h2 { margin: 16px 16px 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--panel-muted); }
.help p { margin: 4px 16px 8px; color: var(--panel-muted); }
.help table { width: calc(100% - 32px); margin: 0 16px; border-collapse: collapse; font-size: 13px; }
.help th, .help td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--panel-line); vertical-align: top; }
.help th { font-weight: 600; color: var(--panel-muted); font-size: 12px; }
.help td.k { white-space: nowrap; }
.help .src { font-size: 10px; padding: 1px 5px; border-radius: 999px; background: var(--panel-hover); color: var(--panel-muted); margin-left: 4px; }
.help .links { display: flex; gap: 16px; padding: 12px 16px 0; }
.help .links button { all: unset; cursor: pointer; color: var(--panel-accent); font-weight: 600; text-decoration: underline; }
.help .links button:focus-visible { outline: 2px solid var(--panel-accent); outline-offset: 2px; }

@media (forced-colors: active) {
  .ring { border-color: Highlight; outline-color: CanvasText; box-shadow: none; }
  .ring.warn, .ring.unnamed, .ring.fake { border-color: Mark; }
  .label, .toast, .chip, .badge { background: Canvas; color: CanvasText; border: 1px solid CanvasText; }
  .label .role, .label .tag { color: Highlight; background: Canvas; }
  .panel { border: 1px solid CanvasText; }
  .item[aria-selected="true"] { outline: 2px solid Highlight; }
}
`;

/** Inline logo mark (same artwork as the extension icon). */
export const LOGO_SVG = `<svg viewBox="0 0 128 128" aria-hidden="true"><rect width="128" height="128" rx="30" fill="#16122e"/><path d="M44 30H30v68h14" fill="none" stroke="#ffd23f" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M84 30h14v68H84" fill="none" stroke="#ffd23f" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="64" cy="64" r="11" fill="#7c5cff"/></svg>`;
