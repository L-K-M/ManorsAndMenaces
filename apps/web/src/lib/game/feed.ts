// The action feed (spec §50, §84): what other players just did, told from the
// viewer's side ("Cordelia sent your Banner home"), with the board point it
// touched so the view can pulse it. Pure; the Chronicle keeps the full log.

import type { MapDefinition } from "@manors-menaces/content";
import { RESOURCE_TYPES, type GameEvent, type GameState, type MenaceLocation, type PlayerId, type ResourceType } from "@manors-menaces/rules";
import { t } from "../i18n.js";
import { regionPoint, type Point } from "./harvestFlights.js";
import { cardName, nameOf, regionName } from "./log.js";

export interface FeedItem {
  /** The player who acted; null for things nobody did (a Menace on its own). */
  actorId: PlayerId | null;
  text: string;
  /** The board piece this touched, in board coordinates, if any. */
  at: Point | null;
  /**
   * A harvest, drawn as `lead` followed by resource icons (`text` still
   * says it in words, for screen readers).
   */
  gains: { lead: string; resources: Partial<Record<ResourceType, number>> } | null;
  /** Aimed at the viewer (a Writ, a counter, a Menace moved onto them). */
  againstViewer: boolean;
  /** The viewer's own harvest: shown as it lands, never in a digest. */
  self: boolean;
}

/** Fewer than this many unseen actions are left to the live toasts alone. */
export const DIGEST_MIN_ITEMS = 4;

export function listText(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} ${t("feed.and")} ${parts[parts.length - 1]}`;
}

function sitePoint(map: MapDefinition, siteId: string): Point | null {
  const s = map.sites.find((x) => x.id === siteId);
  return s ? { x: s.x, y: s.y } : null;
}

/** A Site by name: its landmark, else the first Region it touches. */
export function siteName(map: MapDefinition, siteId: string): string {
  const s = map.sites.find((x) => x.id === siteId);
  if (!s) return "?";
  if (s.landmarkId) return t(`landmark.${s.landmarkId}`);
  return regionName(map, s.adjacentRegionIds[0]);
}

function routeEnds(map: MapDefinition, routeId: string) {
  const r = map.routes.find((x) => x.id === routeId);
  const a = r && map.sites.find((s) => s.id === r.siteA);
  const b = r && map.sites.find((s) => s.id === r.siteB);
  return a && b ? { a, b } : null;
}

function routePoint(map: MapDefinition, routeId: string): Point | null {
  const ends = routeEnds(map, routeId);
  return ends ? { x: (ends.a.x + ends.b.x) / 2, y: (ends.a.y + ends.b.y) / 2 } : null;
}

/** A Route by name: the Region both its ends touch, else its first end. */
export function routeName(map: MapDefinition, routeId: string): string {
  const ends = routeEnds(map, routeId);
  if (!ends) return "?";
  const shared = ends.a.adjacentRegionIds.find((id) => ends.b.adjacentRegionIds.includes(id));
  return shared ? regionName(map, shared) : siteName(map, ends.a.id);
}

function locationPoint(map: MapDefinition, loc: MenaceLocation): Point | null {
  if (loc.kind === "region") return regionPoint(map, loc.regionId);
  if (loc.kind === "site") return sitePoint(map, loc.siteId);
  return routePoint(map, loc.routeId);
}

function locationName(map: MapDefinition, loc: MenaceLocation): string {
  if (loc.kind === "region") return regionName(map, loc.regionId);
  if (loc.kind === "site") return siteName(map, loc.siteId);
  return t("feed.road_by", { place: routeName(map, loc.routeId) });
}

/** Whether a Menace arriving here lands on the viewer's Banners or Holdings. */
function touchesViewer(state: GameState, loc: MenaceLocation, viewerId: PlayerId | null): boolean {
  if (!viewerId) return false;
  if (loc.kind === "region") return Object.values(state.banners).some((b) => b.ownerId === viewerId && b.regionId === loc.regionId);
  if (loc.kind === "site") return Object.values(state.holdings).some((h) => h.ownerId === viewerId && h.siteId === loc.siteId);
  return state.routeOwners[loc.routeId] === viewerId;
}

export function gainsText(gains: Partial<Record<ResourceType, number>>): string {
  return RESOURCE_TYPES.filter((r) => (gains[r] ?? 0) > 0)
    .map((r) => `${gains[r]} ${t(`resource.${r}`)}`)
    .join(", ");
}

/**
 * Feed items for one batch of events as `viewerId` should read them. The
 * viewer's own actions are left out (they just did them), except their
 * harvest, which happens to them at the start of their turn.
 */
export function feedItemsFor(events: readonly GameEvent[], state: GameState, map: MapDefinition, viewerId: PlayerId | null): FeedItem[] {
  const out: FeedItem[] = [];
  const name = (id: PlayerId | null | undefined) => nameOf(state, id);
  const add = (actorId: PlayerId | null, text: string, at: Point | null = null, againstViewer = false) => {
    if (actorId !== null && actorId === viewerId) return;
    out.push({ actorId, text, at, gains: null, againstViewer, self: false });
  };
  // Banner moves arrive one event per Banner; tell them as one line each.
  const planted = new Map<PlayerId, { regions: string[]; home: number; at: Point | null }>();
  const flushBanners = () => {
    for (const [pid, b] of planted) {
      if (b.regions.length) {
        const key = b.regions.length === 1 ? "feed.banner_planted" : "feed.banners_planted";
        add(pid, t(key, { name: name(pid), regions: listText(b.regions) }), b.at);
      }
      if (b.home) {
        add(pid, t(b.home === 1 ? "feed.banner_home" : "feed.banners_home", { name: name(pid), count: b.home }));
      }
    }
    planted.clear();
  };

  for (const e of events) {
    if (e.type !== "banner_assigned") flushBanners();
    switch (e.type) {
      case "holding_built":
        add(
          e.playerId,
          t(e.free ? "feed.manor_placed" : "feed.manor_built", { name: name(e.playerId), place: siteName(map, e.siteId) }),
          sitePoint(map, e.siteId),
        );
        break;
      case "holding_upgraded":
        add(e.playerId, t("feed.stronghold", { name: name(e.playerId), place: siteName(map, e.siteId) }), sitePoint(map, e.siteId));
        break;
      case "route_built":
        add(e.playerId, t("feed.route_built", { name: name(e.playerId), place: routeName(map, e.routeId) }), routePoint(map, e.routeId));
        break;
      case "banner_assigned": {
        const b = planted.get(e.playerId) ?? { regions: [], home: 0, at: null };
        if (e.toRegionId) {
          b.regions.push(regionName(map, e.toRegionId));
          b.at ??= regionPoint(map, e.toRegionId);
        } else b.home += 1;
        planted.set(e.playerId, b);
        break;
      }
      case "banner_displaced": {
        const mine = e.ownerId === viewerId;
        const writ = e.cause === "royal_writ";
        const regionId = writ ? e.fromRegionId : (e.toRegionId ?? e.fromRegionId);
        const key = `feed.${writ ? "writ" : "wizard"}${mine ? "_you" : ""}`;
        add(e.byPlayerId, t(key, { name: name(e.byPlayerId), owner: name(e.ownerId), region: regionName(map, regionId) }), regionPoint(map, regionId), mine);
        break;
      }
      case "menace_moved": {
        const menace = state.menaces[e.menaceId];
        const params = { name: name(e.byPlayerId), menace: menace ? t(`menace.${menace.type}.name`) : "?", place: locationName(map, e.to) };
        add(
          e.byPlayerId,
          t(e.byPlayerId ? "feed.menace_moved_by" : "feed.menace_moved", params),
          locationPoint(map, e.to),
          touchesViewer(state, e.to, viewerId),
        );
        break;
      }
      case "card_bought":
        add(e.playerId, t("feed.card_bought", { name: name(e.playerId) }));
        break;
      case "card_played":
        add(e.playerId, t("feed.card_played", { name: name(e.playerId), card: cardName(e.cardId) }));
        break;
      case "card_cancelled": {
        const mine = e.playerId === viewerId;
        add(
          e.byPlayerId,
          t(mine ? "feed.card_cancelled_you" : "feed.card_cancelled", { by: name(e.byPlayerId), name: name(e.playerId), card: cardName(e.cardId) }),
          null,
          mine,
        );
        break;
      }
      case "market_traded":
        add(
          e.playerId,
          t("feed.market", { name: name(e.playerId), amount: e.giveAmount, give: t(`resource.${e.give}`), receive: t(`resource.${e.receive}`) }),
          e.tradePostSiteId ? sitePoint(map, e.tradePostSiteId) : null,
        );
        break;
      case "quest_claimed":
        add(e.playerId, t("feed.quest", { name: name(e.playerId), quest: t(`quest.${e.questId}.name`), renown: e.renown }));
        break;
      case "resource_transferred": {
        // The payer is the one acting (a Writ's bribe is paid by its issuer),
        // so a payment is news only to the player it was paid to.
        if (e.toPlayerId !== viewerId) break;
        add(e.fromPlayerId, t("feed.paid_you", { amount: e.amount, resource: t(`resource.${e.resource}`), name: name(e.fromPlayerId) }));
        break;
      }
      case "harvest_completed": {
        if (e.playerId === viewerId) {
          const harvested = events.some((x) => x.type === "banner_harvested" && x.playerId === e.playerId);
          if (!harvested) break;
          const text = e.total > 0 ? t("feed.your_harvest", { items: gainsText(e.byType) }) : t("feed.your_harvest_none");
          const gains = e.total > 0 ? { lead: t("feed.your_harvest_lead"), resources: { ...e.byType } } : null;
          out.push({ actorId: e.playerId, text, at: null, gains, againstViewer: false, self: true });
        } else if (e.total > 0) {
          const text = t("feed.harvest", { name: name(e.playerId), items: gainsText(e.byType) });
          const gains = { lead: t("feed.harvest_lead", { name: name(e.playerId) }), resources: { ...e.byType } };
          out.push({ actorId: e.playerId, text, at: null, gains, againstViewer: false, self: false });
        }
        break;
      }
      default:
        break;
    }
  }
  flushBanners();
  return out;
}

/** One published batch, remembered so a returning player can catch up. */
export interface FeedBatch {
  seq: number;
  events: readonly GameEvent[];
  state: GameState;
  /** Players who were watching when it happened (and saw its toasts). */
  seenBy: ReadonlySet<PlayerId>;
}

/**
 * "What happened while you were away": the other players' actions since
 * `sinceSeq`, as `viewerId` should read them. Null when the live toasts
 * already told the viewer enough: fewer than DIGEST_MIN_ITEMS actions, all
 * of which they watched happen.
 */
export function awayDigest(batches: readonly FeedBatch[], map: MapDefinition, viewerId: PlayerId, sinceSeq: number): FeedItem[] | null {
  let missed = false;
  const items: FeedItem[] = [];
  for (const b of batches) {
    if (b.seq <= sinceSeq) continue;
    const told = feedItemsFor(b.events, b.state, map, viewerId).filter((i) => !i.self);
    if (told.length && !b.seenBy.has(viewerId)) missed = true;
    items.push(...told);
  }
  if (!items.length) return null;
  return missed || items.length >= DIGEST_MIN_ITEMS ? items : null;
}
