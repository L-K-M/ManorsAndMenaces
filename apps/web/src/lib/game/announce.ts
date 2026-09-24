// Screen reader announcements (spec §52): turn changes and the key actions of
// players the local user does not control, so AI and remote turns are not
// silent. Built from the Chronicle entries the session already formats.

import type { MapDefinition } from "@manors-menaces/content";
import type { PlayerId } from "@manors-menaces/rules";
import { t } from "../i18n.js";
import { regionName, type LogEntry } from "./log.js";

export interface Perspective {
  /** The one seat this screen belongs to, greeted with "Your turn"; null in hot-seat. */
  self: PlayerId | null;
  /** Seats whose actions the local user makes, and so needs no announcement for. */
  isOwn: (playerId: PlayerId) => boolean;
}

/** Where a holding stands, for speech: its landmark, else a Region it touches. */
function siteName(map: MapDefinition, siteId: string): string {
  const site = map.sites.find((s) => s.id === siteId);
  if (site?.landmarkId) return t(`landmark.${site.landmarkId}`);
  return regionName(map, site?.adjacentRegionIds[0]);
}

function announce(entry: LogEntry, map: MapDefinition, names: Record<PlayerId, string>, who: Perspective): string | null {
  const pid = entry.playerId;
  const name = (pid && names[pid]) || "?";
  const raw = entry.raw;

  if (entry.kind === "turn") return pid && pid === who.self ? t("sr.your_turn") : t("sr.turn", { name });
  if (raw?.type === "game_won") return entry.text;
  if (pid && who.isOwn(pid)) return null;

  if (raw?.type === "holding_built") return t("sr.holding_built", { name, place: siteName(map, raw.siteId) });
  if (raw?.type === "holding_upgraded") return t("sr.holding_upgraded", { name, place: siteName(map, raw.siteId) });
  if (raw?.type === "route_built" || entry.kind === "important") return entry.text;
  return null;
}

/** The lines to announce for newly committed Chronicle entries, in order. */
export function announcementsFor(entries: readonly LogEntry[], map: MapDefinition, names: Record<PlayerId, string>, who: Perspective): string[] {
  return entries.filter((e) => !e.provisional).flatMap((e) => announce(e, map, names, who) ?? []);
}
