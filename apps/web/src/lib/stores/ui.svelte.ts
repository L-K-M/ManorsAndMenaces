// Non-gameplay UI state (spec §45.3). Never serialized with the game.

import type { BannerId, CardId, CardTarget, MenaceId, MenaceLocation, RegionId } from "@manors-menaces/rules";

export type Tool = "none" | "route" | "manor" | "upgrade" | "writ" | "warden" | "card";

export type Pick =
  | { kind: "banner"; id: BannerId }
  | { kind: "region"; id: RegionId }
  | { kind: "menace"; id: MenaceId }
  | { kind: "route"; id: string }
  | { kind: "site"; id: string }
  | { kind: "location"; location: MenaceLocation };

export type Dialog = null | "market" | "settings" | "writ" | "arcane" | "festival" | "hoard" | "rules" | "save" | "menu";

export interface UiState {
  tool: Tool;
  /** Banner selected for (re)assignment. */
  selectedBannerId: BannerId | null;
  /** Menace selected for a Warden move. */
  selectedMenaceId: MenaceId | null;
  /** Banner targeted by a Royal Writ (awaiting bribe choice). */
  writTargetId: BannerId | null;
  /** Card being played and the choices picked so far. */
  cardId: CardId | null;
  cardPicks: Partial<Record<string, unknown>>;
  /** Draft Banner assignment during the Banner Assignment phase. */
  bannerDraft: Record<BannerId, RegionId | null>;
  hoverRegionId: RegionId | null;
  inspect: Pick | null;
  dialog: Dialog;
  panel: "players" | "quests" | "log";
  showDebug: boolean;
}

export const ui: UiState = $state({
  tool: "none",
  selectedBannerId: null,
  selectedMenaceId: null,
  writTargetId: null,
  cardId: null,
  cardPicks: {},
  bannerDraft: {},
  hoverRegionId: null,
  inspect: null,
  dialog: null,
  panel: "players",
  showDebug: false,
});

export function resetTool(): void {
  ui.tool = "none";
  ui.selectedBannerId = null;
  ui.selectedMenaceId = null;
  ui.writTargetId = null;
  ui.cardId = null;
  ui.cardPicks = {};
}

export function locationKey(loc: MenaceLocation): string {
  return loc.kind === "region" ? `region:${loc.regionId}` : loc.kind === "route" ? `route:${loc.routeId}` : `site:${loc.siteId}`;
}

// ------------------------------------------------------------------ card target steps

export type TargetField = { field: string; pick: Pick["kind"] | "dialog" | "hoard" };

/** Which board picks each card needs, in order (spec §47.2: click/tap, not drag). */
export const CARD_STEPS: Record<CardTarget["effect"], TargetField[]> = {
  wizard_interference: [
    { field: "bannerId", pick: "banner" },
    { field: "regionId", pick: "region" },
  ],
  knight_errant: [
    { field: "menaceId", pick: "menace" },
    { field: "destination", pick: "location" },
  ],
  druids_blessing: [{ field: "bannerId", pick: "banner" }],
  teleportation_mishap: [
    { field: "menaceIdA", pick: "menace" },
    { field: "menaceIdB", pick: "menace" },
  ],
  bribe_the_troll: [{ field: "destination", pick: "location" }],
  arcane_exchange: [{ field: "give", pick: "dialog" }],
  festival_at_the_inn: [{ field: "choice", pick: "dialog" }],
  very_minor_prophecy: [],
  fog_of_confusion: [{ field: "routeId", pick: "route" }],
  dragon_whisperer: [
    { field: "destination", pick: "location" },
    { field: "take", pick: "hoard" },
  ],
};

export function valueKey(v: unknown): string {
  if (v && typeof v === "object" && "kind" in (v as object)) return locationKey(v as MenaceLocation);
  return String(v);
}

/** Candidates consistent with the picks so far. */
export function remainingTargets(candidates: CardTarget[], picks: Partial<Record<string, unknown>>): CardTarget[] {
  return candidates.filter((c) =>
    Object.entries(picks).every(([field, value]) => valueKey((c as unknown as Record<string, unknown>)[field]) === valueKey(value)),
  );
}
