import { h, type Overlay } from "./overlay";
import { LOGO_SVG } from "./styles";

export interface RotorItem {
  el?: Element;
  role: string;
  name: string;
  unnamed: boolean;
  /** Extra info on the right: "disabled", "h2 → h4", … */
  tag?: string;
  warn?: boolean;
  indent?: number;
}

export interface RotorGroup {
  id: string;
  label: string;
}

export interface RotorProvider {
  groups: RotorGroup[];
  items(groupId: string): RotorItem[];
}

const MAX_ROWS = 300;
let uid = 0;

/**
 * VO-U style element list: groups across the top (← →), items down the side
 * (↑ ↓), type to filter, Enter to jump.
 */
export class Rotor {
  private panel: HTMLElement | null = null;
  private groupIdx = 0;
  private selected = 0;
  private cache = new Map<string, RotorItem[]>();
  private filtered: RotorItem[] = [];
  private search!: HTMLInputElement;
  private list!: HTMLElement;
  private tabs!: HTMLElement;
  private more!: HTMLElement;
  private restoreFocus: HTMLElement | null = null;
  private idBase = `sqr-${++uid}`;

  constructor(
    private overlay: Overlay,
    private provider: RotorProvider,
    private onChoose: (item: RotorItem) => void,
  ) {}

  get isOpen(): boolean {
    return !!this.panel;
  }

  open(groupId?: string): void {
    this.cache.clear();
    const gi = this.provider.groups.findIndex((g) => g.id === groupId);
    this.groupIdx = gi >= 0 ? gi : 0;
    this.restoreFocus = document.activeElement as HTMLElement | null;
    this.build();
    this.overlay.openPanel(this.panel!);
    this.renderTabs();
    this.renderItems();
    this.search.focus({ preventScroll: true });
  }

  close(restore = true): void {
    if (!this.panel) return;
    this.overlay.closePanel();
    this.panel = null;
    if (restore && this.restoreFocus?.isConnected) this.restoreFocus.focus({ preventScroll: true });
  }

  private build(): void {
    const scrim = h("div", { class: "scrim" });
    const dialog = h("div", { class: "panel", role: "dialog", "aria-modal": "true", "aria-label": "Squarb rotor" });
    const brand = h("div", { class: "brand" });
    brand.innerHTML = LOGO_SVG;
    brand.append("Rotor");
    const header = h("header", {}, brand, h("span", { class: "hint" }, "Every element, grouped by role — the way a screen reader sees this page."));
    this.tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "Element types" });
    this.list = h("ul", { class: "items", role: "listbox", id: `${this.idBase}-list`, "aria-label": "Elements" });
    this.search = h("input", {
      class: "search",
      type: "text",
      role: "combobox",
      "aria-expanded": "true",
      "aria-controls": this.list.id,
      "aria-autocomplete": "list",
      placeholder: "Type to filter…",
      spellcheck: "false",
      autocomplete: "off",
    }) as HTMLInputElement;
    this.search.addEventListener("input", () => {
      this.selected = 0;
      this.renderItems();
    });
    this.more = h("div", { class: "more", hidden: "" });
    const body = h("div", { class: "body" }, this.list, this.more);
    const footer = h(
      "div",
      { class: "footer" },
      keyHint("← →", "type"),
      keyHint("↑ ↓", "item"),
      keyHint("Enter", "jump"),
      keyHint("Esc", "close"),
    );
    dialog.append(header, this.tabs, this.search, body, footer);
    scrim.append(dialog);
    scrim.addEventListener("mousedown", (e) => {
      if (e.target === scrim) this.close();
    });
    this.panel = scrim;
  }

  private itemsFor(groupId: string): RotorItem[] {
    let items = this.cache.get(groupId);
    if (!items) {
      items = this.provider.items(groupId);
      this.cache.set(groupId, items);
    }
    return items;
  }

  private renderTabs(): void {
    this.tabs.replaceChildren();
    this.provider.groups.forEach((g, i) => {
      const items = this.itemsFor(g.id);
      const warn = g.id === "issues" ? items.length > 0 : items.some((it) => it.unnamed);
      const tab = h(
        "button",
        {
          class: "tab",
          role: "tab",
          type: "button",
          tabindex: "-1",
          "aria-selected": String(i === this.groupIdx),
          "data-group": g.id,
        },
        g.label,
        h("span", { class: "count" + (warn ? " warn" : "") }, String(items.length)),
      );
      tab.addEventListener("click", () => this.setGroup(i));
      this.tabs.append(tab);
    });
    this.tabs.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  private setGroup(i: number): void {
    const n = this.provider.groups.length;
    this.groupIdx = (i + n) % n;
    this.selected = 0;
    this.renderTabs();
    this.renderItems();
    this.search.focus({ preventScroll: true });
  }

  private renderItems(): void {
    const g = this.provider.groups[this.groupIdx]!;
    const q = this.search.value.trim().toLowerCase();
    const all = this.itemsFor(g.id);
    this.filtered = q
      ? all.filter((it) => `${it.role} ${it.name} ${it.tag ?? ""}`.toLowerCase().includes(q))
      : all;
    this.list.replaceChildren();
    this.list.setAttribute("aria-label", g.label);
    if (!this.filtered.length) {
      this.list.append(
        h("li", { class: "empty", role: "presentation" }, q ? `No ${g.label.toLowerCase()} match “${q}”.` : emptyMessage(g.id)),
      );
    }
    const rows = this.filtered.slice(0, MAX_ROWS);
    rows.forEach((it, i) => {
      const li = h(
        "li",
        {
          class: "item" + (it.indent ? ` indent-${it.indent}` : ""),
          role: "option",
          id: `${this.idBase}-o${i}`,
          "aria-selected": String(i === this.selected),
        },
        h("span", { class: "r" }, it.role),
        h("span", { class: "n" + (it.unnamed ? " missing" : "") }, it.unnamed ? "(unnamed)" : it.name || "—"),
        it.tag ? h("span", { class: "t" + (it.warn ? " warn" : "") }, it.tag) : null,
      );
      li.addEventListener("mousedown", (e) => e.preventDefault());
      li.addEventListener("click", () => this.choose(i));
      this.list.append(li);
    });
    const hidden = this.filtered.length - rows.length;
    this.more.hidden = hidden <= 0;
    this.more.textContent = hidden > 0 ? `…and ${hidden} more. Type to filter.` : "";
    this.updateSelection();
  }

  private updateSelection(): void {
    const opts = this.list.querySelectorAll<HTMLElement>('[role="option"]');
    opts.forEach((o, i) => o.setAttribute("aria-selected", String(i === this.selected)));
    const sel = opts[this.selected];
    if (sel) {
      this.search.setAttribute("aria-activedescendant", sel.id);
      sel.scrollIntoView({ block: "nearest" });
    } else {
      this.search.removeAttribute("aria-activedescendant");
    }
  }

  private move(delta: number, absolute?: number): void {
    const n = Math.min(this.filtered.length, MAX_ROWS);
    if (!n) return;
    this.selected = absolute !== undefined ? absolute : Math.min(Math.max(0, this.selected + delta), n - 1);
    this.updateSelection();
  }

  private choose(i = this.selected): void {
    const item = this.filtered[i];
    if (!item) return;
    this.close(false);
    this.onChoose(item);
  }

  /** Called by the controller for key events that started inside our UI. */
  handleKey(e: KeyboardEvent): boolean {
    switch (e.key) {
      case "Escape":
        this.close();
        return true;
      case "ArrowLeft":
      case "ArrowRight":
        this.setGroup(this.groupIdx + (e.key === "ArrowRight" ? 1 : -1));
        return true;
      case "Tab":
        this.setGroup(this.groupIdx + (e.shiftKey ? -1 : 1));
        return true;
      case "ArrowDown":
        this.move(1);
        return true;
      case "ArrowUp":
        this.move(-1);
        return true;
      case "PageDown":
        this.move(10);
        return true;
      case "PageUp":
        this.move(-10);
        return true;
      case "Home":
        if (e.ctrlKey || !this.search.value) {
          this.move(0, 0);
          return true;
        }
        return false;
      case "End":
        if (e.ctrlKey || !this.search.value) {
          this.move(0, Math.min(this.filtered.length, MAX_ROWS) - 1);
          return true;
        }
        return false;
      case "Enter":
        this.choose();
        return true;
    }
    return false;
  }
}

function keyHint(k: string, what: string): HTMLElement {
  return h("span", {}, h("kbd", {}, k), ` ${what}`);
}

function emptyMessage(group: string): string {
  switch (group) {
    case "issues":
      return "No issues found. Nice.";
    case "landmarks":
      return "No landmarks. Screen reader users can't skip straight to the main content.";
    case "headings":
      return "No headings. Screen reader users often navigate by heading first.";
    default:
      return "None on this page.";
  }
}
