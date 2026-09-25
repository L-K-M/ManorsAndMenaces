// Turns engine events into concise, readable log lines (spec §84).

import type { MapDefinition } from "@manors-menaces/content";
import { cardDefIdOf, type GameCommand, type GameEvent, type GameState, type MenaceLocation, type RulesEngine } from "@manors-menaces/rules";
import { t } from "../i18n.js";
import { replayHistory } from "./replay.js";

export interface LogEntry {
  id: number;
  text: string;
  playerId: string | null;
  kind: "turn" | "info" | "important";
  /** Raw event for the expandable debug view. */
  raw?: GameEvent;
  /** Logged locally for a buffered (not yet submitted) action. */
  provisional?: boolean;
}

let nextId = 1;

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
    case "route":
      return t("route.road").toLowerCase() + " " + loc.routeId.replace("route_", "#");
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
