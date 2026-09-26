// Harvest flights (spec §50): which resource tokens fly from which Region to
// which player when a batch of events produces resources, and where a Menace
// or card changed the yield. Pure data in board coordinates; the
// HarvestFlights component turns it into motion.

import type { MapDefinition } from "@manors-menaces/content";
import type { GameEvent, HarvestNote, PlayerId, RegionId, ResourceType } from "@manors-menaces/rules";

export interface Point {
  x: number;
  y: number;
}

export interface Flight {
  playerId: PlayerId;
  resource: ResourceType;
  /** Board coordinates the token starts from (a Region's label). */
  from: Point;
  /** Position in the batch; the view staggers launches by it. */
  order: number;
}

export interface HarvestBadge {
  playerId: PlayerId;
  regionId: RegionId;
  at: Point;
  note: HarvestNote;
}

export interface HarvestPlan {
  flights: Flight[];
  badges: HarvestBadge[];
}

/**
 * A harvest blocked outright (Troll, Plague) matters most, then a Menace
 * changing the yield, then a card adding to it.
 */
const NOTE_PRIORITY: readonly HarvestNote[] = ["blocked_by_troll", "sick", "taken_by_dragon", "converted_by_witch", "druids_blessing"];

export function regionPoint(map: MapDefinition, regionId: RegionId): Point | null {
  const r = map.regions.find((x) => x.id === regionId);
  return r ? { x: r.labelX, y: r.labelY } : null;
}

/**
 * Plan the flights for one batch of events. Harvests fly from each Banner's
 * Region; starting resources (after the second Manor) fly from the Regions
 * around the Manor that earned them. Other gains (trades, cards) do not fly.
 */
export function planHarvestFlights(events: readonly GameEvent[], map: MapDefinition): HarvestPlan {
  const flights: Flight[] = [];
  const badges: HarvestBadge[] = [];
  // Regions around each player's latest Manor in this batch, still unclaimed
  // by a starting-resource gain.
  const startingRegions = new Map<PlayerId, RegionId[]>();

  for (const e of events) {
    if (e.type === "banner_harvested") {
      const at = regionPoint(map, e.regionId);
      if (!at) continue;
      if (e.produced) {
        for (let i = 0; i < e.amount; i++) flights.push({ playerId: e.playerId, resource: e.produced, from: at, order: flights.length });
      }
      const note = NOTE_PRIORITY.find((n) => e.notes.includes(n));
      if (note) badges.push({ playerId: e.playerId, regionId: e.regionId, at, note });
    } else if (e.type === "holding_built") {
      const site = map.sites.find((s) => s.id === e.siteId);
      if (site) startingRegions.set(e.playerId, [...site.adjacentRegionIds]);
    } else if (e.type === "resource_gained" && e.reason === "starting_resources") {
      const around = startingRegions.get(e.playerId) ?? [];
      const index = around.findIndex((id) => map.regions.find((r) => r.id === id)?.resource === e.resource);
      // A seat bonus has no Region to fly from; its counter still updates.
      if (index < 0) continue;
      const [regionId] = around.splice(index, 1) as [RegionId];
      const at = regionPoint(map, regionId);
      if (!at) continue;
      for (let i = 0; i < e.amount; i++) flights.push({ playerId: e.playerId, resource: e.resource, from: at, order: flights.length });
    }
  }
  return { flights, badges };
}

/** Counter key shared by flights and the resource counters they land in. */
export function resourceKey(playerId: PlayerId, resource: ResourceType): string {
  return `${playerId}:${resource}`;
}

export interface ArcFrame {
  x: number;
  y: number;
  offset: number;
}

/**
 * Points along a gentle arc from `from` to `to` (screen pixels), eased so
 * the token accelerates away and settles into its counter. The arc bows
 * upward by `lift` times the distance, capped so long flights stay tidy.
 */
export function arcFrames(from: Point, to: Point, steps = 10, lift = 0.25): ArcFrame[] {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const bow = Math.min(120, dist * lift);
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - bow };
  const frames: ArcFrame[] = [];
  for (let i = 0; i <= steps; i++) {
    const offset = i / steps;
    const s = offset < 0.5 ? 2 * offset * offset : 1 - (-2 * offset + 2) ** 2 / 2;
    const u = 1 - s;
    frames.push({
      x: u * u * from.x + 2 * u * s * control.x + s * s * to.x,
      y: u * u * from.y + 2 * u * s * control.y + s * s * to.y,
      offset,
    });
  }
  return frames;
}
