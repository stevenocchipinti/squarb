import {
  INDEXED_ROLES,
  NAMED_ONLY_LANDMARKS,
  TARGET_BY_ID,
  type TargetId,
} from "../../shared/targets";
import { accessibleName, bumpNameGeneration } from "./names";
import { computeRole, headingLevel } from "./roles";
import {
  compareFlat,
  flatContains,
  isCrossOriginFrame,
  isExcludedByAncestor,
  OWN_UI_ATTR,
  walkFlat,
} from "./tree";
import { isRendered } from "./visibility";

export interface Entry {
  el: Element;
  role: string;
  /** Heading level, only for headings. */
  level?: number;
}

/** Attributes that can change an element's role or exclusion. */
const ROLE_ATTRS = [
  "role",
  "aria-hidden",
  "inert",
  "href",
  "type",
  "aria-level",
  "contenteditable",
  "alt",
  "list",
  "multiple",
  "size",
  "aria-label",
  "aria-labelledby",
];

/** Attributes that only change names; they bump the name cache. */
const NAME_ATTRS = ["title", "value", "placeholder", "aria-describedby", "aria-checked", "aria-expanded"];

/** Past this many dirty subtrees a full rebuild is cheaper than patching. */
const MAX_PATCH_ROOTS = 40;

export interface IndexStats {
  entries: number;
  shadowRoots: number;
  sameOriginFrames: number;
  crossOriginFrames: number;
  lastBuildMs: number;
  fullBuilds: number;
  patches: number;
}

export interface RoleIndexOptions {
  root?: Document;
  /** Called whenever a new same-origin frame document is discovered. */
  onFrameDocument?: (doc: Document) => void;
  /** Called after any mutation is recorded (before the index is patched). */
  onMutation?: () => void;
}

/**
 * All elements whose computed role is one we navigate to, in flat-tree
 * order. Built on first use; afterwards a MutationObserver records which
 * subtrees changed, and those are re-walked lazily on the next query.
 */
export class RoleIndex {
  private entries: Entry[] = [];
  private built = false;
  private dirtyRoots = new Set<Node>();
  private needsFull = false;
  private observer: MutationObserver;
  private observed = new WeakSet<Node>();
  private frames = new Set<HTMLIFrameElement>();
  private crossOrigin = new Set<HTMLIFrameElement>();
  private shadowCount = 0;
  private doc: Document;
  private opts: RoleIndexOptions;
  readonly stats: IndexStats = {
    entries: 0,
    shadowRoots: 0,
    sameOriginFrames: 0,
    crossOriginFrames: 0,
    lastBuildMs: 0,
    fullBuilds: 0,
    patches: 0,
  };

  constructor(opts: RoleIndexOptions = {}) {
    this.opts = opts;
    this.doc = opts.root ?? document;
    const MO = this.doc.defaultView?.MutationObserver ?? MutationObserver;
    this.observer = new MO((records) => this.record(records));
  }

  disconnect(): void {
    this.observer.disconnect();
  }

  /** Force the next query to rebuild from scratch. */
  invalidate(): void {
    this.needsFull = true;
  }

  /** Make sure the index reflects the current DOM. */
  refresh(): void {
    if (!this.built || this.needsFull) {
      this.fullBuild();
    } else if (this.dirtyRoots.size) {
      this.patch();
    }
  }

  all(): readonly Entry[] {
    this.refresh();
    return this.entries;
  }

  getStats(): IndexStats {
    this.refresh();
    return {
      ...this.stats,
      entries: this.entries.length,
      shadowRoots: this.shadowCount,
      sameOriginFrames: this.frames.size,
      crossOriginFrames: this.crossOrigin.size,
    };
  }

  /** Position at which `node` would sit in the entry list (lower bound). */
  positionOf(node: Node): number {
    this.refresh();
    return this.lowerBound(node);
  }

  private lowerBound(node: Node): number {
    const list = this.entries;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (compareFlat(list[mid]!.el, node) < 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // ---------------------------------------------------------------- build

  private fullBuild(): void {
    const t0 = performance.now();
    this.entries = [];
    this.frames.clear();
    this.crossOrigin.clear();
    this.shadowCount = 0;
    this.observe(this.doc);
    if (this.doc.documentElement) this.walkInto(this.doc.documentElement, this.entries);
    this.built = true;
    this.needsFull = false;
    this.dirtyRoots.clear();
    this.stats.fullBuilds++;
    this.stats.lastBuildMs = performance.now() - t0;
  }

  private walkInto(root: Element, out: Entry[]): void {
    walkFlat(root, {
      visit: (el) => {
        const role = computeRole(el);
        if (role && INDEXED_ROLES.has(role)) {
          out.push(role === "heading" ? { el, role, level: headingLevel(el) } : { el, role });
        }
      },
      onShadowRoot: (sr) => {
        this.shadowCount++;
        this.observe(sr);
      },
      onFrame: (frame, fdoc) => {
        if (!this.observed.has(frame)) {
          this.observed.add(frame);
          frame.addEventListener("load", () => this.markDirty(frame));
        }
        if (fdoc) {
          this.frames.add(frame);
          if (!this.observed.has(fdoc)) {
            this.observe(fdoc);
            this.opts.onFrameDocument?.(fdoc);
          }
        } else if (isCrossOriginFrame(frame)) {
          this.crossOrigin.add(frame);
        }
      },
    });
  }

  private observe(target: Document | ShadowRoot): void {
    if (this.observed.has(target)) return;
    this.observed.add(target);
    this.observer.observe(target, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ROLE_ATTRS, ...NAME_ATTRS],
    });
    // Popovers open/close without attribute changes; names inside may change.
    target.addEventListener("toggle", () => bumpNameGeneration(), { capture: true });
  }

  // ---------------------------------------------------------------- patching

  private markDirty(node: Node): void {
    if (this.needsFull) return;
    this.dirtyRoots.add(node);
    if (this.dirtyRoots.size > MAX_PATCH_ROOTS) this.needsFull = true;
  }

  private record(records: MutationRecord[]): void {
    let relevant = false;
    for (const r of records) {
      if (r.type === "childList") {
        if (isOwnUiOnly(r)) continue;
        relevant = true;
        this.markDirty(r.target);
      } else if (r.type === "attributes") {
        relevant = true;
        if (ROLE_ATTRS.includes(r.attributeName!)) this.markDirty(r.target);
      } else {
        relevant = true; // characterData: names only
      }
    }
    if (relevant) {
      bumpNameGeneration();
      this.opts.onMutation?.();
    }
  }

  private patch(): void {
    const t0 = performance.now();
    // 1. Drop entries for nodes that left the document.
    this.entries = this.entries.filter((e) => e.el.isConnected);
    // 2. Collapse dirty roots: skip disconnected ones and those inside another.
    const roots = [...this.dirtyRoots].filter((n) => n.isConnected);
    this.dirtyRoots.clear();
    const top = roots.filter((r) => !roots.some((o) => o !== r && flatContains(o, r)));
    for (const root of top) {
      const el = root.nodeType === 9 ? (root as Document).documentElement : (root as Element);
      if (!el || el.nodeType !== 1) continue;
      if (el === this.doc.documentElement || el === this.doc.body) {
        this.fullBuild();
        return;
      }
      // 3. Remove the contiguous run of entries inside this root…
      const start = this.lowerBound(el);
      let end = start;
      while (end < this.entries.length && flatContains(el, this.entries[end]!.el)) end++;
      // …and re-walk it, unless an ancestor now hides it from AT.
      const fresh: Entry[] = [];
      if (!isExcludedByAncestor(el)) this.walkInto(el, fresh);
      this.entries.splice(start, end - start, ...fresh);
    }
    this.stats.patches++;
    this.stats.lastBuildMs = performance.now() - t0;
  }
}

function isOwnUiOnly(r: MutationRecord): boolean {
  const nodes = [...r.addedNodes, ...r.removedNodes];
  return nodes.length > 0 && nodes.every((n) => n.nodeType === 1 && (n as Element).hasAttribute(OWN_UI_ATTR));
}

// -------------------------------------------------------------------- matching

/**
 * Does this entry count for this target? Applies heading-level filters and
 * the "form/region are only landmarks when named" rule (which needs a name,
 * so it's computed lazily here rather than at index time).
 */
export function entryMatches(e: Entry, target: TargetId): boolean {
  const def = TARGET_BY_ID[target];
  if (!def.roles.includes(e.role)) return false;
  if (def.level !== undefined && e.level !== def.level) return false;
  if (target === "landmark" && NAMED_ONLY_LANDMARKS.has(e.role) && !accessibleName(e.el)) return false;
  return true;
}

/**
 * The open modal, if any. Like a screen reader, we treat everything outside
 * it as unreachable while it's open.
 */
export function topModal(doc: Document = document): Element | null {
  let modal: Element | null = null;
  try {
    const natives = doc.querySelectorAll("dialog:modal");
    if (natives.length) modal = natives[natives.length - 1]!;
  } catch {
    /* :modal unsupported */
  }
  if (!modal) {
    const aria = doc.querySelectorAll('[aria-modal="true"]');
    for (let i = aria.length - 1; i >= 0; i--) {
      const r = aria[i]!.getAttribute("role");
      if ((r === "dialog" || r === "alertdialog") && isRendered(aria[i]!)) {
        modal = aria[i]!;
        break;
      }
    }
  }
  return modal;
}

/** Entry is navigable right now: rendered, and inside the open modal if there is one. */
export function isNavigable(e: Entry, modal: Element | null): boolean {
  if (modal && !flatContains(modal, e.el)) return false;
  return isRendered(e.el);
}
