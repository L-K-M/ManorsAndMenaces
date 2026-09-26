// Screen reader announcements (spec §52): turn changes, the key actions of
// players the local user does not control, and what the local seat harvests
// or pays, so AI and remote turns are not silent. Built from the Chronicle
// entries the session already formats.

import type { MapDefinition } from "@manors-menaces/content";
import type { PlayerId } from "@manors-menaces/rules";
import { t } from "../i18n.js";
import { regionName, type LogEntry } from "./log.js";

export interface Perspective {
  /**
   * The one seat this screen belongs to: greeted with "Your turn", told its
   * harvest and payments, and not told about its own actions. Null when
   * several humans share the device, as each is the others' opponent.
   */
  self: PlayerId | null;
}

export function perspectiveFor(onlinePlayerId: PlayerId | null, localHumans: readonly PlayerId[]): Perspective {
  if (onlinePlayerId) return { self: onlinePlayerId };
  return { self: localHumans.length === 1 ? (localHumans[0] ?? null) : null };
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
  // A rival's quip (#24): its bubble is visual only, so the line is spoken here.
  if (entry.kind === "quip") return entry.text;
  // The end of the game and the omen of it concern everyone.
  if (raw?.type === "game_won" || entry.kind === "omen") return entry.text;
  // A Royal Insurance Policy paying out: news to its holder, who did not act.
  if (raw?.type === "insurance_claimed") return entry.text;
  // Changes to the local seat's resources that its own actions did not name.
  if (raw?.type === "harvest_completed") return raw.playerId === who.self ? entry.text : null;
  if (raw?.type === "resource_transferred") return raw.fromPlayerId === who.self ? entry.text : null;
  if (pid && pid === who.self) return null;

  if (raw?.type === "holding_built") return t("sr.holding_built", { name, place: siteName(map, raw.siteId) });
  if (raw?.type === "holding_upgraded") return t("sr.holding_upgraded", { name, place: siteName(map, raw.siteId) });
  if (raw?.type === "route_built" || entry.kind === "important") return entry.text;
  return null;
}

/** The lines to announce for newly committed Chronicle entries, in order. */
export function announcementsFor(entries: readonly LogEntry[], map: MapDefinition, names: Record<PlayerId, string>, who: Perspective): string[] {
  return entries.filter((e) => !e.provisional).flatMap((e) => announce(e, map, names, who) ?? []);
}
