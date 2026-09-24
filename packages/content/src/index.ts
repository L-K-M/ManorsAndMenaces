import { clone, type BoardTopology, type RulesContent } from "@manors-menaces/rules";
import { CARDS } from "./cards.js";
import { GREENVALE_MAP } from "./maps/greenvale.js";
import { MENACES } from "./menaces.js";
import { QUESTS } from "./quests.js";
import type { MapDefinition } from "./types.js";

export * from "./types.js";
export { CARDS } from "./cards.js";
export { QUESTS } from "./quests.js";
export { MENACES } from "./menaces.js";
export { EN } from "./i18n/en.js";
export { validateMap, maximumIndependentSet, type MapValidation } from "./validate.js";
export { GREENVALE_MAP } from "./maps/greenvale.js";

export const MAPS: Record<string, MapDefinition> = { [GREENVALE_MAP.id]: GREENVALE_MAP };

/** Strip geometry: the rules engine only sees topology (spec §103). */
export function toBoardTopology(map: MapDefinition): BoardTopology {
  return {
    id: map.id,
    sites: map.sites.map((s) => ({
      id: s.id,
      adjacentRegionIds: [...s.adjacentRegionIds],
      ...(s.landmarkId ? { landmarkId: s.landmarkId } : {}),
      ...(s.tradePost ? { tradePost: { ...s.tradePost } } : {}),
    })),
    routes: map.routes.map((r) => ({ id: r.id, siteA: r.siteA, siteB: r.siteB, kind: r.kind })),
    regions: map.regions.map((r) => ({ id: r.id, resource: r.resource, capacity: r.capacity, adjacentSiteIds: [...r.adjacentSiteIds] })),
    landmarks: map.landmarks.map((l) => ({ id: l.id, siteId: l.siteId })),
    menaceStarts: map.menaceStarts.map((m) => clone(m)),
    questParams: { kingsHighway: [...map.questParams.kingsHighway] },
  };
}

const contentCache = new Map<string, RulesContent>();

/** The rules content bundle for a map (cached so engine contexts are reused). */
export function rulesContentFor(mapId: string = GREENVALE_MAP.id): RulesContent {
  const cached = contentCache.get(mapId);
  if (cached) return cached;
  const map = MAPS[mapId];
  if (!map) throw new Error(`Unknown map ${mapId}`);
  const content: RulesContent = {
    board: toBoardTopology(map),
    cards: CARDS.map((c) => ({
      id: c.id,
      type: c.type,
      timing: [...c.timing],
      effectId: c.effectId,
      copies: c.copies,
      ...(c.requiresMenace ? { requiresMenace: c.requiresMenace } : {}),
    })),
    quests: QUESTS.map((q) => ({ id: q.id, renown: q.renown, conditionId: q.conditionId, exclusive: q.exclusive })),
  };
  contentCache.set(mapId, content);
  return content;
}
