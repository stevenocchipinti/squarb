import { TARGETS, type TargetId } from "./targets";

export interface Settings {
  /** Prefix for "next" (VoiceOver: lowercase letter). */
  nextKey: string;
  /** Prefix for "previous" (VoiceOver: Shift + letter). */
  prevKey: string;
  /** Prefix for highlight-all mode; pressed twice opens the rotor. */
  highlightKey: string;
  /** Opens the help overlay. */
  helpKey: string;
  /** Keys per target. A target may have several keys (e.g. j and f). */
  targetKeys: Record<TargetId, string[]>;
  /** How long a prefix waits for its second key. */
  sequenceTimeoutMs: number;
  /** Flash "looks clickable" elements the jump passed over. */
  showClickableWarnings: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  nextKey: "]",
  prevKey: "[",
  highlightKey: "\\",
  helpKey: "?",
  targetKeys: Object.fromEntries(TARGETS.map((t) => [t.id, [...t.defaultKeys]])) as Record<
    TargetId,
    string[]
  >,
  sequenceTimeoutMs: 1000,
  showClickableWarnings: true,
};

const STORAGE_KEY = "settings";

/** Merge stored (possibly partial / stale) settings over the defaults. */
export function normalizeSettings(raw: unknown): Settings {
  const out: Settings = structuredClone(DEFAULT_SETTINGS);
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Partial<Settings>;
  for (const k of ["nextKey", "prevKey", "highlightKey", "helpKey"] as const) {
    if (typeof r[k] === "string" && r[k]!.length === 1) out[k] = r[k]!;
  }
  if (typeof r.sequenceTimeoutMs === "number" && r.sequenceTimeoutMs >= 200 && r.sequenceTimeoutMs <= 5000) {
    out.sequenceTimeoutMs = r.sequenceTimeoutMs;
  }
  if (typeof r.showClickableWarnings === "boolean") out.showClickableWarnings = r.showClickableWarnings;
  if (r.targetKeys && typeof r.targetKeys === "object") {
    for (const t of TARGETS) {
      const keys = (r.targetKeys as Record<string, unknown>)[t.id];
      if (Array.isArray(keys)) {
        out.targetKeys[t.id] = keys.filter((k): k is string => typeof k === "string" && k.length === 1);
      }
    }
  }
  return out;
}

/** Build key → target lookup. Later targets never steal an earlier target's key. */
export function buildKeyLookup(settings: Settings): Map<string, TargetId> {
  const map = new Map<string, TargetId>();
  for (const t of TARGETS) {
    for (const k of settings.targetKeys[t.id] ?? []) {
      if (!map.has(k)) map.set(k, t.id);
    }
  }
  return map;
}

export interface KeyConflict {
  key: string;
  owners: string[];
}

/** Report keys bound to more than one thing (used by the options page). */
export function findConflicts(settings: Settings): KeyConflict[] {
  const owners = new Map<string, string[]>();
  const add = (k: string, who: string) => owners.set(k, [...(owners.get(k) ?? []), who]);
  add(settings.nextKey, "Next prefix");
  add(settings.prevKey, "Previous prefix");
  add(settings.highlightKey, "Highlight prefix");
  add(settings.helpKey, "Help");
  for (const t of TARGETS) for (const k of settings.targetKeys[t.id] ?? []) add(k, t.plural);
  return [...owners].filter(([, o]) => o.length > 1).map(([key, o]) => ({ key, owners: o }));
}

export async function loadSettings(): Promise<Settings> {
  try {
    const got = await chrome.storage.sync.get(STORAGE_KEY);
    return normalizeSettings(got[STORAGE_KEY]);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: s });
}

export function onSettingsChanged(cb: (s: Settings) => void): void {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" && changes[STORAGE_KEY]) cb(normalizeSettings(changes[STORAGE_KEY].newValue));
    });
  } catch {
    /* not running as an extension (tests) */
  }
}
