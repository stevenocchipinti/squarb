import type { Settings } from "../../shared/settings";
import { TARGETS } from "../../shared/targets";
import { h, type Overlay } from "./overlay";
import { LOGO_SVG } from "./styles";

export interface HelpActions {
  openOptions(): void;
  openExplainer(anchor?: string): void;
}

/** The `?` cheat sheet, including the "now test it in VoiceOver" mapping. */
export class Help {
  private panel: HTMLElement | null = null;
  private restoreFocus: HTMLElement | null = null;

  constructor(
    private overlay: Overlay,
    private actions: HelpActions,
  ) {}

  get isOpen(): boolean {
    return !!this.panel;
  }

  toggle(settings: Settings): void {
    if (this.panel) this.close();
    else this.open(settings);
  }

  open(s: Settings): void {
    this.restoreFocus = document.activeElement as HTMLElement | null;
    const k = (x: string) => h("kbd", {}, x);
    const N = s.nextKey;
    const P = s.prevKey;
    const H = s.highlightKey;

    const jumpRows = TARGETS.filter((t) => !/^heading[1-6]$/.test(t.id) || t.id === "heading1").map((t) => {
      const keys = s.targetKeys[t.id] ?? [];
      const isLevels = t.id === "heading1";
      const keyCell = h("td", { class: "k" });
      if (isLevels) {
        keyCell.append(k(`${N}1`), "–", k(`${N}6`));
      } else if (keys.length) {
        keys.forEach((key, i) => {
          if (i) keyCell.append(" ");
          keyCell.append(k(N + key));
        });
      } else {
        keyCell.append("unbound");
      }
      return h(
        "tr",
        {},
        keyCell,
        h("td", {}, isLevels ? "heading at level 1–6" : t.singular, t.origin === "NVDA" ? h("span", { class: "src" }, "NVDA letter") : null),
        h("td", {}, isLevels ? "Quick Nav 1–6 (Shift for previous)" : t.voiceOver),
        h("td", {}, isLevels ? "1–6 / Shift+1–6" : t.nvda),
      );
    });

    const table = (head: string[], rows: HTMLElement[]) =>
      h("table", {}, h("thead", {}, h("tr", {}, ...head.map((x) => h("th", { scope: "col" }, x)))), h("tbody", {}, ...rows));

    const moveRow = (keys: (HTMLElement | string)[], ...what: (HTMLElement | string)[]) => {
      const td = h("td", { class: "k" });
      td.append(...keys);
      return h("tr", {}, td, h("td", {}, ...what));
    };

    const brand = h("div", { class: "brand" });
    brand.innerHTML = LOGO_SVG;
    brand.append("Squarb keys");

    const settingsBtn = h("button", { type: "button" }, "Change keys");
    settingsBtn.addEventListener("click", () => this.actions.openOptions());
    const whyBtn = h("button", { type: "button" }, "Why the warnings?");
    whyBtn.addEventListener("click", () => this.actions.openExplainer());

    const body = h(
      "div",
      { class: "body help" },
      h("p", {}, "Jumps use computed roles and accessible names, the same data a screen reader reads. If a control is missing here, it's missing for screen reader users too."),
      h("h2", {}, "Jump"),
      h("p", {}, k(N), " + key goes to the next one, ", k(P), " + key to the previous one. These are the VoiceOver Quick Nav letters, with NVDA letters for the extras."),
      table(["Keys", "Goes to", "VoiceOver", "NVDA"], jumpRows),
      h("h2", {}, "Move & modes"),
      table(
        ["Keys", "Does"],
        [
          moveRow([k(N + N), " ", k(P + P)], "repeat the last jump forward / back"),
          moveRow([k(H), " + key"], "highlight every match; then bare ", k(N), " / ", k(P), " step through them"),
          moveRow(
            [k(N + (s.targetKeys.button?.[0] ?? "b").toUpperCase()), " ", k(N + (s.targetKeys.link?.[0] ?? "l").toUpperCase())],
            "uppercase: buttons/links ",
            h("em", {}, "plus"),
            " things that only look clickable (a ",
            h("code", {}, "<div onclick>"),
            "). ",
            k("Enter"),
            " clicks those for you. Works with ",
            k(P),
            " and ",
            k(H),
            " too",
          ),
          moveRow([k(H + H)], "rotor: every element grouped by role, type to filter"),
          moveRow([k("Enter")], "focus the highlighted element (press again to activate it); on a look-alike, click it"),
          moveRow([k("Esc")], "clear highlights; inside a text field, leave the field"),
          moveRow([k(s.helpKey)], "this help"),
        ],
      ),
      h("h2", {}, "Now test it in VoiceOver"),
      h(
        "p",
        {},
        "Turn VoiceOver on and off with ",
        k("Cmd-F5"),
        ". ",
        k("VO"),
        " means ",
        k("Control-Option"),
        " (or ",
        k("Caps Lock"),
        "). Press ",
        k("VO-Q"),
        " to toggle single-key Quick Nav, then the same letters work without the bracket: ",
        k("B"),
        " next button, ",
        k("Shift-B"),
        " previous. ",
        k("VO-U"),
        " opens the rotor, the real version of ",
        k(H + H),
        ". Without Quick Nav, ",
        k("VO-Cmd"),
        " + letter does the same jumps for headings, links, tables, lists, form controls and graphics.",
      ),
      h("p", {}, "In NVDA, browse mode is on by default in web pages: press the letter alone, Shift + letter for previous, and ", k("NVDA+F7"), " for the elements list."),
      h("div", { class: "links" }, settingsBtn, whyBtn),
    );
    const header = h("header", {}, brand, h("span", { class: "hint" }, "Esc to close"));
    const dialog = h("div", { class: "panel", role: "dialog", "aria-modal": "true", "aria-label": "Squarb keyboard shortcuts", tabindex: "-1" }, header, body);
    const scrim = h("div", { class: "scrim" }, dialog);
    scrim.addEventListener("mousedown", (e) => {
      if (e.target === scrim) this.close();
    });
    this.panel = scrim;
    this.overlay.openPanel(scrim);
    dialog.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.panel) return;
    this.overlay.closePanel();
    this.panel = null;
    if (this.restoreFocus?.isConnected) this.restoreFocus.focus({ preventScroll: true });
  }

  handleKey(e: KeyboardEvent, s: Settings): boolean {
    if (e.key === "Escape" || e.key === s.helpKey) {
      this.close();
      return true;
    }
    return false;
  }
}
