import { EN } from "./i18n/en.js";

// Named computer rivals: pure flavour (names, portraits, quips) layered over
// the AI difficulty levels. Their text lives in the i18n catalog under
// `rival.<id>.*`; quips are numbered `rival.<id>.quip.<trigger>.<n>` from 1.

/** Moments a rival may comment on, from the UI's point of view. */
export const RIVAL_QUIP_TRIGGERS = [
  /** The rival built a Manor or raised a Stronghold. */
  "own_build",
  /** A human built a Manor sharing a Region with one of the rival's Holdings. */
  "near_you",
  /** The rival issued a Royal Writ against a human's Banner. */
  "writ",
  /** Someone else moved a Menace onto the rival's Banner, Route or Holding. */
  "menace_hit",
  /**
   * Someone else's card burned the rival's Route, flattened or reduced its
   * Holding, sickened its Banners or swapped hands with it.
   */
  "sabotaged",
  /** The rival became the sole Renown leader. */
  "lead",
  "win",
  "lose",
] as const;

export type RivalQuipTrigger = (typeof RIVAL_QUIP_TRIGGERS)[number];

/** Parts the web client composes into a small portrait, tinted with the seat colour. */
export interface RivalPortrait {
  face: "round" | "long" | "troll" | "goblin";
  headwear: "coronet" | "horns" | "feathered_hat" | "helm" | "eyeshade" | "witch_hat";
  /** "visor": the eyes are hidden by the headwear. */
  eyes: "dots" | "spectacles" | "monocle" | "narrow" | "visor";
  mouth: "moustache" | "tusks" | "smirk" | "grin" | "smile";
}

export interface RivalDefinition {
  id: string;
  nameKey: string;
  /** Short epithet, e.g. "the Cautious Builder". */
  titleKey: string;
  mottoKey: string;
  portrait: RivalPortrait;
}

const rival = (id: string, portrait: RivalPortrait): RivalDefinition => ({
  id,
  nameKey: `rival.${id}.name`,
  titleKey: `rival.${id}.title`,
  mottoKey: `rival.${id}.motto`,
  portrait,
});

export const RIVALS: readonly RivalDefinition[] = [
  // Keep ids stable for existing saves when a character's name or art changes.
  rival("lord_mumble", { face: "goblin", headwear: "coronet", eyes: "dots", mouth: "tusks" }),
  rival("grum", { face: "troll", headwear: "horns", eyes: "narrow", mouth: "tusks" }),
  rival("madame_quill", { face: "long", headwear: "feathered_hat", eyes: "monocle", mouth: "smirk" }),
  rival("sir_brash", { face: "round", headwear: "helm", eyes: "visor", mouth: "grin" }),
  rival("tally_nib", { face: "goblin", headwear: "eyeshade", eyes: "spectacles", mouth: "grin" }),
  rival("lady_fennick", { face: "long", headwear: "witch_hat", eyes: "dots", mouth: "smile" }),
];

export function rivalById(id: string | null | undefined): RivalDefinition | undefined {
  return id ? RIVALS.find((r) => r.id === id) : undefined;
}

/** The catalog keys of a rival's quips for one trigger, in order. */
export function rivalQuipKeys(rivalId: string, trigger: RivalQuipTrigger): string[] {
  const keys: string[] = [];
  for (let n = 1; `rival.${rivalId}.quip.${trigger}.${n}` in EN; n++) keys.push(`rival.${rivalId}.quip.${trigger}.${n}`);
  return keys;
}
