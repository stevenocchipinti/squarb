/**
 * Navigation targets: what each quick-nav key jumps to.
 *
 * Every target is defined purely in terms of computed ARIA role (plus heading
 * level / landmark naming). Nothing here looks at tag names or class names,
 * which is the whole point: if the page doesn't expose it to assistive tech,
 * Squarb can't find it either.
 */

export type TargetId =
  | "button"
  | "heading"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "link"
  | "formControl"
  | "table"
  | "list"
  | "graphic"
  | "textField"
  | "comboBox"
  | "radio"
  | "landmark"
  | "listItem";

export interface TargetDef {
  id: TargetId;
  /** Singular, e.g. "button". */
  singular: string;
  /** Plural, e.g. "buttons". */
  plural: string;
  /** Roles that match. Landmark/heading-level rules are applied on top. */
  roles: readonly string[];
  /** Heading level filter (1–6). */
  level?: number;
  /** Default keys (first one is the "primary" shown in UI). */
  defaultKeys: readonly string[];
  /** Which screen reader the default letter comes from. */
  origin: "VoiceOver" | "NVDA";
  /** What to do in VoiceOver to get the same result. */
  voiceOver: string;
  /** NVDA browse-mode equivalent. */
  nvda: string;
  /** Group heading in the rotor; undefined = not shown as its own rotor group. */
  rotor?: string;
}

export const FORM_CONTROL_ROLES = [
  "textbox",
  "searchbox",
  "combobox",
  "listbox",
  "checkbox",
  "radio",
  "switch",
  "slider",
  "spinbutton",
] as const;

export const LANDMARK_ROLES = [
  "main",
  "navigation",
  "banner",
  "contentinfo",
  "complementary",
  "search",
  "form",
  "region",
] as const;

/** Landmarks that only count when they have an accessible name. */
export const NAMED_ONLY_LANDMARKS = new Set(["form", "region"]);

const headingLevel = (n: number): TargetDef => ({
  id: `heading${n}` as TargetId,
  singular: `level ${n} heading`,
  plural: `level ${n} headings`,
  roles: ["heading"],
  level: n,
  defaultKeys: [String(n)],
  origin: "VoiceOver",
  voiceOver: `Quick Nav ${n} / Shift-${n}`,
  nvda: `${n} / Shift+${n}`,
});

export const TARGETS: readonly TargetDef[] = [
  {
    id: "button",
    singular: "button",
    plural: "buttons",
    roles: ["button"],
    defaultKeys: ["b"],
    origin: "VoiceOver",
    voiceOver: "Quick Nav B / Shift-B",
    nvda: "B / Shift+B",
    rotor: "Buttons",
  },
  {
    id: "heading",
    singular: "heading",
    plural: "headings",
    roles: ["heading"],
    defaultKeys: ["h"],
    origin: "VoiceOver",
    voiceOver: "Quick Nav H / Shift-H (or VO-Cmd-H)",
    nvda: "H / Shift+H",
    rotor: "Headings",
  },
  headingLevel(1),
  headingLevel(2),
  headingLevel(3),
  headingLevel(4),
  headingLevel(5),
  headingLevel(6),
  {
    id: "link",
    singular: "link",
    plural: "links",
    roles: ["link"],
    defaultKeys: ["l"],
    origin: "VoiceOver",
    voiceOver: "Quick Nav L / Shift-L (or VO-Cmd-L)",
    nvda: "K / Shift+K",
    rotor: "Links",
  },
  {
    id: "formControl",
    singular: "form control",
    plural: "form controls",
    roles: FORM_CONTROL_ROLES,
    defaultKeys: ["j", "f"],
    origin: "VoiceOver",
    voiceOver: "Quick Nav J / Shift-J (or VO-Cmd-J)",
    nvda: "F / Shift+F",
    rotor: "Form controls",
  },
  {
    id: "table",
    singular: "table",
    plural: "tables",
    roles: ["table", "grid", "treegrid"],
    defaultKeys: ["t"],
    origin: "VoiceOver",
    voiceOver: "Quick Nav T / Shift-T (or VO-Cmd-T)",
    nvda: "T / Shift+T",
    rotor: "Tables",
  },
  {
    id: "list",
    singular: "list",
    plural: "lists",
    roles: ["list"],
    defaultKeys: ["x"],
    origin: "VoiceOver",
    voiceOver: "Quick Nav X / Shift-X (or VO-Cmd-X)",
    nvda: "L / Shift+L",
  },
  {
    id: "graphic",
    singular: "image",
    plural: "images",
    roles: ["img", "image", "graphics-document"],
    defaultKeys: ["g"],
    origin: "VoiceOver",
    voiceOver: "Quick Nav G / Shift-G (or VO-Cmd-G)",
    nvda: "G / Shift+G",
    rotor: "Images",
  },
  {
    id: "textField",
    singular: "text field",
    plural: "text fields",
    roles: ["textbox", "searchbox"],
    defaultKeys: ["e"],
    origin: "NVDA",
    voiceOver: "Rotor → Form Controls, or Quick Nav J",
    nvda: "E / Shift+E",
  },
  {
    id: "comboBox",
    singular: "combo box",
    plural: "combo boxes",
    roles: ["combobox", "listbox"],
    defaultKeys: ["c"],
    origin: "NVDA",
    voiceOver: "Rotor → Form Controls, or Quick Nav J",
    nvda: "C / Shift+C",
  },
  {
    id: "radio",
    singular: "radio button",
    plural: "radio buttons",
    roles: ["radio"],
    defaultKeys: ["r"],
    origin: "NVDA",
    voiceOver: "Rotor → Form Controls, or Quick Nav J",
    nvda: "R / Shift+R",
  },
  {
    id: "landmark",
    singular: "landmark",
    plural: "landmarks",
    roles: LANDMARK_ROLES,
    defaultKeys: ["d"],
    origin: "NVDA",
    voiceOver: "Rotor → Landmarks (VO-U, then ← →)",
    nvda: "D / Shift+D",
    rotor: "Landmarks",
  },
  {
    id: "listItem",
    singular: "list item",
    plural: "list items",
    roles: ["listitem"],
    defaultKeys: ["i"],
    origin: "NVDA",
    voiceOver: "Interact with the list (VO-Shift-↓), then VO-→",
    nvda: "I / Shift+I",
  },
];

export const TARGET_BY_ID: Record<TargetId, TargetDef> = Object.fromEntries(
  TARGETS.map((t) => [t.id, t]),
) as Record<TargetId, TargetDef>;

/** Every role any target cares about; the index only stores these. */
export const INDEXED_ROLES: ReadonlySet<string> = new Set(TARGETS.flatMap((t) => t.roles));

/** Roles where a missing accessible name is a real problem. */
export const NAME_REQUIRED_ROLES: ReadonlySet<string> = new Set([
  "button",
  "link",
  "img",
  "image",
  "graphics-document",
  "heading",
  ...FORM_CONTROL_ROLES,
]);

/** Roles that mean "this thing is interactive" for the clickable-div check. */
export const INTERACTIVE_ROLES: ReadonlySet<string> = new Set([
  "button",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "tab",
  "treeitem",
  "gridcell",
  ...FORM_CONTROL_ROLES,
]);

/**
 * Targets with an uppercase "loose" variant (]B, ]L): real matches plus
 * elements that look clickable but expose no role.
 */
export const LOOSE_TARGETS: ReadonlySet<TargetId> = new Set<TargetId>(["button", "link"]);
