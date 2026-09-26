// Turns engine events into concise, readable log lines (spec §84).

import type { MapDefinition } from "@manors-menaces/content";
import type { HistoryEntry } from "@manors-menaces/protocol";
import {
  cardDefIdOf,
  type GameCommand,
  type GameEvent,
  type GameState,
  type Holding,
  type HoldingId,
  type MenaceId,
  type MenaceLocation,
  type RouteId,
  type RulesEngine,
} from "@manors-menaces/rules";
import { t } from "../i18n.js";
import { replayHistory } from "./replay.js";

export interface LogEntry {
  id: number;
  text: string;
  playerId: string | null;
  /**
   * `omen`: the endgame foretold or the world ended (Ragnarök), shown most
   * prominently. `divider` marks where the moves a returning player missed begin.
   */
  kind: "turn" | "info" | "important" | "quip" | "omen" | "divider";
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

/** A Site by name: its landmark, else the first Region it touches. */
export function siteName(map: MapDefinition, siteId: string): string {
  const s = map.sites.find((x) => x.id === siteId);
  if (!s) return "?";
  if (s.landmarkId) return t(`landmark.${s.landmarkId}`);
  return regionName(map, s.adjacentRegionIds[0]);
}

/** A Route's two end Sites, or null for an unknown Route. */
export function routeEnds(map: MapDefinition, routeId: string) {
  const r = map.routes.find((x) => x.id === routeId);
  const a = r && map.sites.find((s) => s.id === r.siteA);
  const b = r && map.sites.find((s) => s.id === r.siteB);
  return a && b ? { a, b } : null;
}

/** A Route by name: the Region both its ends touch, else its first end. */
export function routeName(map: MapDefinition, routeId: string): string {
  const ends = routeEnds(map, routeId);
  if (!ends) return "?";
  const shared = ends.a.adjacentRegionIds.find((id) => ends.b.adjacentRegionIds.includes(id));
  return shared ? regionName(map, shared) : siteName(map, ends.a.id);
}

export function placeName(map: MapDefinition, loc: MenaceLocation): string {
  switch (loc.kind) {
    case "region":
      return regionName(map, loc.regionId);
    case "route":
      return `${routeKindName(map, loc.routeId)} ${loc.routeId.replace("route_", "#")}`;
    case "site": {
      const site = map.sites.find((s) => s.id === loc.siteId);
      return site?.landmarkId ? t(`landmark.${site.landmarkId}`) : `site ${loc.siteId.replace("site_", "#")}`;
    }
  }
}

export function cardName(cardId: string): string {
  return t(`card.${cardDefIdOf(cardId)}.name`);
}

function menaceName(state: GameState, menaceId: MenaceId): string {
  const m = state.menaces[menaceId];
  return m ? t(`menace.${m.type}.name`) : "?";
}

function routeKindName(map: MapDefinition, routeId: RouteId): string {
  const kind = map.routes.find((r) => r.id === routeId)?.kind ?? "road";
  return t(`route.${kind}`).toLowerCase();
}

/**
 * What Dragon's Landing struck. Events are formatted against the state after
 * their batch, where a razed Manor is gone and a reduced Stronghold is
 * already a Manor.
 */
function landedOn(events: readonly GameEvent[], state: GameState, holdingId: HoldingId): Holding["type"] {
  if (events.some((e) => e.type === "holding_reduced" && e.holdingId === holdingId)) return "stronghold";
  return state.holdings[holdingId]?.type ?? "manor";
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
      case "resource_transferred": {
        const params = { from: nameOf(state, e.fromPlayerId), to: nameOf(state, e.toPlayerId), amount: e.amount, resource: t(`resource.${e.resource}`) };
        // A card (Robin of the Glade) takes; a Writ's bribe is paid.
        if (e.reason === "card_effect") push(t("log.taken", params), e.toPlayerId, "info", e);
        else push(t("log.transfer", params), e.fromPlayerId, "info", e);
        break;
      }
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
        else if (e.delta < 0) {
          push(t("log.hoard_taken", { menace: menaceName(state, e.menaceId), amount: -e.delta, resource: t(`resource.${e.resource}`) }), null, "info", e);
        }
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
        else if (e.effect === "plague") {
          push(t("log.plague", { name: nameOf(state, e.playerId), place: siteName(map, e.siteId), count: e.bannerIds.length }), e.playerId, "important", e);
        }
        break;
      case "effect_expired":
        if (e.effect === "plague") push(t("log.plague_cured", { name: nameOf(state, e.playerId) }), e.playerId, "info", e);
        else if (e.effect === "smouldering") push(t("log.embers_cooled", { name: nameOf(state, e.playerId) }), e.playerId, "info", e);
        break;
      case "hands_swapped":
        push(t("log.hands_swapped", { name: nameOf(state, e.playerId), opponent: nameOf(state, e.opponentId) }), e.playerId, "important", e);
        break;
      case "route_burned":
        push(
          t("log.route_burned", {
            name: nameOf(state, e.byPlayerId),
            owner: nameOf(state, e.ownerId),
            route: routeKindName(map, e.routeId),
            place: routeName(map, e.routeId),
          }),
          e.byPlayerId,
          "important",
          e,
        );
        break;
      // The dragon of Dragon's Landing picks its target at random: nobody's
      // action, so every player, its caster too, is told where it came down.
      case "dragon_landed": {
        const holding = t(`holding.${landedOn(events, state, e.holdingId)}`);
        push(t("log.dragon_landed", { owner: nameOf(state, e.ownerId), holding, place: siteName(map, e.siteId) }), null, "important", e);
        break;
      }
      case "holding_destroyed":
        push(t("log.holding_destroyed", { owner: nameOf(state, e.ownerId), place: siteName(map, e.siteId) }), null, "important", e);
        break;
      case "holding_reduced":
        push(t("log.holding_reduced", { owner: nameOf(state, e.ownerId), place: siteName(map, e.siteId) }), null, "important", e);
        break;
      case "insurance_claimed":
        push(t("log.insurance_claimed", { name: nameOf(state, e.playerId), card: t(`card.${e.against}.name`) }), e.playerId, "important", e);
        break;
      case "renown_gained":
        push(t("log.bard", { name: nameOf(state, e.playerId), amount: e.amount }), e.playerId, "important", e);
        break;
      case "card_foretold":
        push(t("log.foretold", { card: cardName(e.cardId) }), null, "omen", e);
        break;
      case "prophecy_revealed":
        push(t("log.prophecy", { name: nameOf(state, e.playerId) }), e.playerId, "info", e);
        break;
      case "game_won":
        if (e.cause === "ragnarok") push(t("log.won_ragnarok", { name: nameOf(state, e.playerId), renown: e.renown }), e.playerId, "omen", e);
        else push(t("log.won", { name: nameOf(state, e.playerId), renown: e.renown }), e.playerId, "important", e);
        break;
      default:
        break;
    }
  }
  flushAssigned();
  return out;
}

/** How a game ended other than by reaching the target Renown (§7). */
export type EndCause = NonNullable<Extract<GameEvent, { type: "game_won" }>["cause"]>;

/**
 * How the game ended, read from its game_won entry. Null for a normal win,
 * and when the Chronicle does not reach back to the end (an online match
 * joined after it finished).
 */
export function endCauseOf(entries: readonly LogEntry[]): EndCause | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const raw = entries[i]?.raw;
    if (raw?.type === "game_won") return raw.cause ?? null;
  }
  return null;
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
