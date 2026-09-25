// Turns engine events into concise, readable log lines (spec §84).

import type { MapDefinition } from "@manors-menaces/content";
import type { HistoryEntry } from "@manors-menaces/protocol";
import { cardDefIdOf, type GameCommand, type GameEvent, type GameState, type MenaceLocation, type RulesEngine } from "@manors-menaces/rules";
import { t } from "../i18n.js";
import { replayHistory } from "./replay.js";

export interface LogEntry {
  id: number;
  text: string;
  playerId: string | null;
  /** `divider` marks where the moves a returning player missed begin. */
  kind: "turn" | "info" | "important" | "quip" | "divider";
  /** Raw event for the expandable debug view. */
  raw?: GameEvent;
  /** Logged locally for a buffered (not yet submitted) action. */
  provisional?: boolean;
}

let nextId = 1;

/** A rival's remark for the Chronicle; it is flavour, not an engine event. */
export function quipEntry(text: string, playerId: string): LogEntry {
  return { id: nextId++, text, playerId, kind: "quip" };
}

export function nameOf(state: GameState, playerId: string | null | undefined): string {
  return (playerId && state.players[playerId]?.displayName) || "?";
}

export function regionName(map: MapDefinition, regionId: string | null | undefined): string {
  return map.regions.find((r) => r.id === regionId)?.name ?? "—";
}

export function placeName(map: MapDefinition, loc: MenaceLocation): string {
  switch (loc.kind) {
    case "region":
      return regionName(map, loc.regionId);
    case "route": {
      const kind = map.routes.find((r) => r.id === loc.routeId)?.kind ?? "road";
      return `${t(`route.${kind}`).toLowerCase()} ${loc.routeId.replace("route_", "#")}`;
    }
    case "site": {
      const site = map.sites.find((s) => s.id === loc.siteId);
      return site?.landmarkId ? t(`landmark.${site.landmarkId}`) : `site ${loc.siteId.replace("site_", "#")}`;
    }
  }
}

export function cardName(cardId: string): string {
  return t(`card.${cardDefIdOf(cardId)}.name`);
}

/** Format one batch of events into log entries. Consecutive details are merged. */
export function formatEvents(events: GameEvent[], state: GameState, map: MapDefinition): LogEntry[] {
  const out: LogEntry[] = [];
  const push = (text: string, playerId: string | null, kind: LogEntry["kind"] = "info", raw?: GameEvent) =>
    out.push({ id: nextId++, text, playerId, kind, ...(raw ? { raw } : {}) });
  let assigned: { playerId: string; count: number } | null = null;
  const flushAssigned = () => {
    if (assigned) push(t("log.banner_assigned", { name: nameOf(state, assigned.playerId), count: assigned.count }), assigned.playerId);
    assigned = null;
  };
  for (const e of events) {
    if (e.type !== "banner_assigned") flushAssigned();
    switch (e.type) {
      case "turn_started":
        push(t("log.turn", { name: nameOf(state, e.playerId) }), e.playerId, "turn", e);
        break;
      case "harvest_skipped":
        push(t("log.harvest_skipped", { name: nameOf(state, e.playerId) }), e.playerId, "info", e);
        break;
      case "harvest_completed": {
        const items = Object.entries(e.byType)
          .filter(([, n]) => (n ?? 0) > 0)
          .map(([r, n]) => `${n} ${t(`resource.${r}`)}`)
          .join(", ");
        push(items ? t("log.harvest", { name: nameOf(state, e.playerId), items }) : t("log.harvest_none", { name: nameOf(state, e.playerId) }), e.playerId, "info", e);
        break;
      }
      case "route_built":
        if (!e.free) push(t("log.route_built", { name: nameOf(state, e.playerId) }), e.playerId, "info", e);
        break;
      case "holding_built":
        if (!e.free) push(t("log.holding_built", { name: nameOf(state, e.playerId) }), e.playerId, "info", e);
        break;
      case "holding_upgraded":
        push(t("log.holding_upgraded", { name: nameOf(state, e.playerId) }), e.playerId, "important", e);
        break;
      case "banner_assigned":
        if (assigned && assigned.playerId === e.playerId) assigned.count += 1;
        else {
          flushAssigned();
          assigned = { playerId: e.playerId, count: 1 };
        }
        break;
      case "banner_displaced":
        push(
          t(e.cause === "royal_writ" ? "log.writ" : "log.wizard", {
            name: nameOf(state, e.byPlayerId),
            owner: nameOf(state, e.ownerId),
            region: regionName(map, e.cause === "royal_writ" ? e.fromRegionId : e.toRegionId),
          }),
          e.byPlayerId,
          "important",
          e,
        );
        break;
      case "resource_transferred":
        push(t("log.transfer", { from: nameOf(state, e.fromPlayerId), to: nameOf(state, e.toPlayerId), resource: t(`resource.${e.resource}`) }), e.fromPlayerId, "info", e);
        break;
      case "menace_moved": {
        const m = state.menaces[e.menaceId];
        push(t("log.menace_moved", { menace: m ? t(`menace.${m.type}.name`) : "?", place: placeName(map, e.to) }), e.byPlayerId, "important", e);
        break;
      }
      case "warden_hired":
        push(t("log.warden", { name: nameOf(state, e.playerId) }), e.playerId, "info", e);
        break;
      case "hoard_changed":
        if (e.delta > 0) push(t("log.hoard", { resource: t(`resource.${e.resource}`) }), null, "info", e);
        break;
      case "card_bought":
        push(t("log.card_bought", { name: nameOf(state, e.playerId) }), e.playerId, "info", e);
        break;
      case "card_played":
        push(t("log.card_played", { name: nameOf(state, e.playerId), card: cardName(e.cardId) }), e.playerId, "important", e);
        break;
      case "card_cancelled":
        push(t("log.card_cancelled", { by: nameOf(state, e.byPlayerId), name: nameOf(state, e.playerId), card: cardName(e.cardId) }), e.byPlayerId, "important", e);
        break;
      case "card_discarded":
        push(t("log.discard", { name: nameOf(state, e.playerId) }), e.playerId, "info", e);
        break;
      case "market_traded":
        push(
          t("log.market", { name: nameOf(state, e.playerId), amount: e.giveAmount, give: t(`resource.${e.give}`), receive: t(`resource.${e.receive}`) }),
          e.playerId,
          "info",
          e,
        );
        break;
      case "quest_claimed":
        push(t("log.quest", { name: nameOf(state, e.playerId), quest: t(`quest.${e.questId}.name`), renown: e.renown }), e.playerId, "important", e);
        break;
      case "quest_revealed":
        push(t("log.quest_revealed", { quest: t(`quest.${e.questId}.name`) }), null, "info", e);
        break;
      case "quest_expired":
        push(t("log.quest_expired", { quest: t(`quest.${e.questId}.name`) }), null, "info", e);
        break;
      case "effect_started":
        if (e.effect === "fog") push(t("log.fog", { name: nameOf(state, e.playerId) }), e.playerId, "info", e);
        break;
      case "prophecy_revealed":
        push(t("log.prophecy", { name: nameOf(state, e.playerId) }), e.playerId, "info", e);
        break;
      case "game_won":
        push(t("log.won", { name: nameOf(state, e.playerId), renown: e.renown }), e.playerId, "important", e);
        break;
      default:
        break;
    }
  }
  flushAssigned();
  return out;
}

/** An important Chronicle line that no engine event produced (a client notice). */
export function noticeEntry(text: string, playerId: string | null): LogEntry {
  return { id: nextId++, text, playerId, kind: "important" };
}

/**
 * Rebuilds the Chronicle of a saved game by replaying its history (the log
 * itself is not saved). When the replay stops early or does not reach
 * `saved` (unrecorded debug commands), the entries it could derive end with
 * a note that some events are missing.
 */
export function rebuildLog(
  engine: RulesEngine,
  map: MapDefinition,
  initial: GameState,
  history: readonly GameCommand[],
  saved: GameState,
): { entries: LogEntry[]; complete: boolean } {
  const entries: LogEntry[] = [];
  const { complete } = replayHistory(engine, initial, history, (step) => entries.push(...formatEvents(step.events, step.after, map)), saved);
  if (!complete) entries.push({ id: nextId++, text: t("log.history_unavailable"), playerId: null, kind: "info" });
  return { entries, complete };
}

/**
 * The Chronicle of an online match from the server's history (the client
 * keeps no log between visits). The moves made after `lastSeen`, the revision
 * this device last showed, follow a "since your last visit" divider; there is
 * none on a first visit or when nothing new happened.
 */
export function historyLog(entries: readonly HistoryEntry[], complete: boolean, lastSeen: number | null, state: GameState, map: MapDefinition): LogEntry[] {
  const out: LogEntry[] = [];
  let divided = false;
  for (const entry of entries) {
    // Formatted against the latest state: the formatters read only what does
    // not change during a match (names, menace kinds, the map).
    const lines = formatEvents(entry.events, state, map);
    if (!divided && lastSeen !== null && entry.revision > lastSeen && lines.length) {
      out.push({ id: nextId++, text: t("log.since_last_visit"), playerId: null, kind: "divider" });
      divided = true;
    }
    out.push(...lines);
  }
  if (!complete) out.push({ id: nextId++, text: t("log.history_incomplete"), playerId: null, kind: "info" });
  return out;
}
