import { topModal } from "../a11y/index";
import { OWN_UI_ATTR } from "../a11y/tree";
import { isVisuallyHidden, viewportRect, visibleAnchor, type Box } from "../a11y/visibility";
import { CSS } from "./styles";

export interface LabelInfo {
  role: string;
  name: string;
  /** Interactive role with no accessible name. */
  unnamed: boolean;
  tags: { text: string; warn?: boolean }[];
}

export interface AllItem {
  el: Element;
  unnamed: boolean;
}

export interface WarnItem {
  el: Element;
  message: string;
}

const HOST_STYLE = [
  "all: initial",
  "display: block",
  "position: fixed",
  "inset: 0",
  "width: 100vw",
  "height: 100vh",
  "margin: 0",
  "padding: 0",
  "border: 0",
  "background: transparent",
  "overflow: visible",
  "pointer-events: none",
  "z-index: 2147483647",
  "color-scheme: light dark",
]
  .map((d) => d + " !important")
  .join(";");

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

/**
 * Owns the shadow host and everything drawn over the page: the current
 * highlight ring + label, highlight-all rings, warning flashes, the toast,
 * the pending-key chip, and any open panel.
 */
export class Overlay {
  readonly host: HTMLElement;
  readonly root: ShadowRoot;
  private layer: HTMLElement;
  private ring: HTMLElement;
  private label: HTMLElement;
  private toastEl: HTMLElement;
  private chip: HTMLElement;
  private allLayer: HTMLElement;
  private warnLayer: HTMLElement;
  private current: { el: Element; info: LabelInfo; onWhy?: () => void } | null = null;
  private all: AllItem[] = [];
  private warns: { item: WarnItem; ring: HTMLElement; label: HTMLElement; until: number }[] = [];
  private panel: HTMLElement | null = null;
  private toastTimer = 0;
  private rafQueued = false;
  private tick = 0;
  private listening = new WeakSet<Window>();

  constructor(private doc: Document = document) {
    this.host = doc.createElement("squarb-ui");
    this.host.setAttribute(OWN_UI_ATTR, "");
    this.host.setAttribute("style", HOST_STYLE);
    this.root = this.host.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = CSS;
    this.layer = h("div", { class: "layer" });
    this.allLayer = h("div");
    this.warnLayer = h("div");
    this.ring = h("div", { class: "ring current", hidden: "" });
    this.label = h("div", { class: "label current", hidden: "" });
    this.toastEl = h("div", { class: "toast gone", role: "status", "aria-live": "polite" });
    this.chip = h("div", { class: "chip", hidden: "", "aria-hidden": "true" });
    this.layer.append(this.allLayer, this.warnLayer, this.ring, this.label, this.chip, this.toastEl);
    this.root.append(style, this.layer);
    this.watchWindow(doc.defaultView!);
  }

  /** Repositions on scroll/resize in this window (and frames we discover). */
  watchWindow(win: Window): void {
    if (this.listening.has(win)) return;
    this.listening.add(win);
    const onMove = () => this.schedule();
    win.addEventListener("scroll", onMove, { capture: true, passive: true });
    win.addEventListener("resize", onMove, { passive: true });
  }

  isOwnEvent(e: Event): boolean {
    return e.composedPath().includes(this.host);
  }

  get hasUi(): boolean {
    return !!this.current || this.all.length > 0 || !!this.panel || this.warns.length > 0;
  }

  get panelOpen(): boolean {
    return !!this.panel;
  }

  // ---------------------------------------------------------------- mounting

  private ensureMounted(): void {
    const modal = topModal(this.doc);
    const parent = modal ?? this.doc.documentElement;
    const anyHost = this.host as HTMLElement & { showPopover?: () => void; hidePopover?: () => void };
    if (this.host.parentNode !== parent) {
      parent.append(this.host);
    }
    if (typeof anyHost.showPopover === "function") {
      if (!this.host.hasAttribute("popover")) this.host.setAttribute("popover", "manual");
      let open = false;
      try {
        open = this.host.matches(":popover-open");
      } catch {
        /* ignore */
      }
      // Re-show to move above a modal that opened after us.
      if (open && modal) anyHost.hidePopover!();
      if (!open || modal) {
        try {
          anyHost.showPopover();
        } catch {
          /* not connected yet */
        }
      }
    }
    this.startTicker();
  }

  private maybeUnmount(): void {
    if (this.hasUi) return;
    this.stopTicker();
  }

  // ---------------------------------------------------------------- current

  setCurrent(el: Element, info: LabelInfo, onWhy?: () => void): void {
    this.current = onWhy ? { el, info, onWhy } : { el, info };
    this.ensureMounted();
    this.renderLabel();
    this.ring.hidden = false;
    this.label.hidden = false;
    this.position();
  }

  clearCurrent(): void {
    this.current = null;
    this.ring.hidden = true;
    this.label.hidden = true;
    this.maybeUnmount();
  }

  get currentEl(): Element | null {
    return this.current?.el ?? null;
  }

  private renderLabel(): void {
    const c = this.current!;
    const { info } = c;
    this.label.replaceChildren();
    this.label.className = "label current" + (info.unnamed ? " unnamed" : "");
    this.label.append(h("span", { class: "role" }, info.role));
    if (info.unnamed) this.label.append(h("span", { class: "name missing" }, "(unnamed)"));
    else if (info.name) this.label.append(h("span", { class: "name" }, info.name));
    for (const t of info.tags) this.label.append(h("span", { class: "tag" + (t.warn ? " warn" : "") }, t.text));
    if (c.onWhy) {
      const why = h("button", { class: "why", type: "button", tabindex: "-1" }, "Why?");
      why.addEventListener("click", (e) => {
        e.stopPropagation();
        c.onWhy!();
      });
      this.label.append(why);
    }
    this.ring.classList.toggle("unnamed", info.unnamed);
  }

  // ---------------------------------------------------------------- all

  setAll(items: AllItem[]): void {
    this.all = items;
    this.allLayer.replaceChildren();
    if (items.length) this.ensureMounted();
    else this.maybeUnmount();
    this.position();
  }

  clearAll(): void {
    this.setAll([]);
  }

  // ---------------------------------------------------------------- warnings

  flashWarnings(items: WarnItem[], ms = 2600): void {
    if (!items.length) return;
    this.ensureMounted();
    const until = performance.now() + ms;
    for (const item of items) {
      const ring = h("div", { class: "ring warn" });
      const label = h("div", { class: "label warn" }, h("span", { class: "role" }, "⚠ no role"), h("span", { class: "name" }, item.message));
      this.warnLayer.append(ring, label);
      this.warns.push({ item, ring, label, until });
    }
    this.position();
  }

  clearWarnings(): void {
    this.warns = [];
    this.warnLayer.replaceChildren();
    this.maybeUnmount();
  }

  // ---------------------------------------------------------------- toast / chip

  toast(content: string | Node, ms = 1800): void {
    this.ensureMounted();
    clearTimeout(this.toastTimer);
    this.toastEl.replaceChildren(content);
    this.toastEl.classList.remove("gone");
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.add("gone");
      this.maybeUnmount();
    }, ms);
  }

  showPending(prefix: string | null): void {
    if (!prefix) {
      this.chip.hidden = true;
      return;
    }
    this.ensureMounted();
    this.chip.replaceChildren(prefix, h("span", { class: "dots" }, " …"));
    this.chip.hidden = false;
  }

  // ---------------------------------------------------------------- panels

  openPanel(panel: HTMLElement): void {
    this.closePanel();
    this.panel = panel;
    this.ensureMounted();
    this.layer.append(panel);
  }

  closePanel(): void {
    this.panel?.remove();
    this.panel = null;
    this.maybeUnmount();
  }

  // ---------------------------------------------------------------- layout

  private schedule(): void {
    if (this.rafQueued || !this.hasUi) return;
    this.rafQueued = true;
    requestAnimationFrame(() => {
      this.rafQueued = false;
      this.position();
    });
  }

  private startTicker(): void {
    // Catches layout shifts that don't fire scroll/resize (lazy images, etc).
    if (!this.tick) this.tick = window.setInterval(() => this.schedule(), 300);
  }

  private stopTicker(): void {
    clearInterval(this.tick);
    this.tick = 0;
  }

  /** Box to draw for an element; visually hidden ones borrow an ancestor's. */
  private boxFor(el: Element): { box: Box; hiddenTarget: boolean } | null {
    if (!el.isConnected) return null;
    if (isVisuallyHidden(el)) return { box: viewportRect(visibleAnchor(el)), hiddenTarget: true };
    return { box: viewportRect(el), hiddenTarget: false };
  }

  position(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 3;

    if (this.current) {
      const b = this.boxFor(this.current.el);
      if (!b) {
        this.clearCurrent();
      } else {
        const { box } = b;
        this.ring.classList.toggle("hidden-target", b.hiddenTarget);
        this.place(this.ring, box, pad);
        this.placeLabel(this.label, box, pad, vw, vh);
      }
    }

    // Highlight-all: only draw what's near the viewport.
    if (this.all.length) {
      const frag = document.createDocumentFragment();
      let n = 0;
      for (let i = 0; i < this.all.length && n < 600; i++) {
        const it = this.all[i]!;
        if (it.el === this.current?.el) continue;
        const b = this.boxFor(it.el);
        if (!b) continue;
        const { box } = b;
        if (box.top + box.height < -50 || box.top > vh + 50) continue;
        const ring = h("div", { class: "ring all" + (it.unnamed ? " unnamed" : "") });
        this.place(ring, box, 2);
        // Number straddles the top-right corner, clear of left-aligned field labels.
        const badge = h("div", { class: "badge" }, String(i + 1));
        const bx = Math.min(vw - 24, Math.max(0, box.left + box.width - 10));
        badge.style.translate = `${bx}px ${Math.max(0, box.top - 9)}px`;
        frag.append(ring, badge);
        n++;
      }
      this.allLayer.replaceChildren(frag);
    }

    if (this.warns.length) {
      const now = performance.now();
      this.warns = this.warns.filter((w) => {
        const b = this.boxFor(w.item.el);
        if (!b || now > w.until + 400) {
          w.ring.remove();
          w.label.remove();
          return false;
        }
        if (now > w.until) {
          w.ring.classList.add("fading");
          w.label.classList.add("fading");
          w.label.style.opacity = "0";
        }
        this.place(w.ring, b.box, 2);
        this.placeLabel(w.label, b.box, 2, vw, vh, true);
        return true;
      });
      if (!this.warns.length) this.maybeUnmount();
    }
  }

  private place(el: HTMLElement, box: Box, pad: number): void {
    el.style.left = "0";
    el.style.top = "0";
    el.style.translate = `${box.left - pad}px ${box.top - pad}px`;
    el.style.width = `${Math.max(box.width + pad * 2, 8)}px`;
    el.style.height = `${Math.max(box.height + pad * 2, 8)}px`;
  }

  private placeLabel(label: HTMLElement, box: Box, pad: number, vw: number, vh: number, below = false): void {
    const lh = label.offsetHeight || 24;
    const lw = label.offsetWidth || 120;
    let top = below ? box.top + box.height + pad + 6 : box.top - pad - lh - 6;
    if (top < 4) top = box.top + box.height + pad + 6;
    if (top + lh > vh - 4) top = Math.max(4, box.top - pad - lh - 6);
    top = Math.min(Math.max(4, top), vh - lh - 4);
    const left = Math.min(Math.max(4, box.left - pad), vw - lw - 4);
    label.style.left = "0";
    label.style.top = "0";
    label.style.translate = `${left}px ${top}px`;
  }

  destroy(): void {
    this.stopTicker();
    this.host.remove();
  }
}
