import { clone, type BoardTopology, type RulesContent } from "@manors-menaces/rules";
import { recentCache } from "./cache.js";
import { CARDS } from "./cards.js";
import { mapById } from "./maps.js";
import { GREENVALE_MAP } from "./maps/greenvale.js";
import { QUESTS } from "./quests.js";
import type { MapDefinition } from "./types.js";
import { validateMap } from "./validate.js";

export * from "./types.js";
export { CARDS } from "./cards.js";
export { QUESTS } from "./quests.js";
export { MENACES } from "./menaces.js";
export { EN } from "./i18n/en.js";
export { RIVALS, RIVAL_QUIP_TRIGGERS, rivalById, rivalQuipKeys, type RivalDefinition, type RivalPortrait, type RivalQuipTrigger } from "./rivals.js";
export { validateMap, maximumIndependentSet, type MapValidation } from "./validate.js";
export { GREENVALE_MAP } from "./maps/greenvale.js";

export { LEGACY_GREENVALE_MAP } from "./maps/greenvale-legacy.js";
export { ISLANDS, MAPS, mapById, mapIdForNewGame, parseMapId, type ParsedMapId } from "./maps.js";
export { drawLayout } from "./layout.js";

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

/** Rules content kept ready, drawn layouts included; see recentCache. */
const CONTENTS_KEPT = 64;
const contentCache = recentCache<RulesContent>(CONTENTS_KEPT);

/** The rules content bundle for a map (cached so engine contexts are reused). */
export function rulesContentFor(mapId: string = GREENVALE_MAP.id): RulesContent {
  const cached = contentCache.get(mapId);
  if (cached) return cached;
  const map = mapById(mapId);
  if (!map) throw new Error(`Unknown map ${mapId}`);
  // A malformed map breaks games in confusing ways much later (§102), so the
  // web client, the server and the tools all refuse one here, once per map.
  const { errors } = validateMap(map);
  if (errors.length) throw new Error(`Map ${mapId} is invalid: ${errors.join("; ")}`);
  const content: RulesContent = {
    board: toBoardTopology(map),
    cards: CARDS.map((c) => ({
      id: c.id,
      type: c.type,
      timing: [...c.timing],
      effectId: c.effectId,
      copies: c.copies,
      ...(c.requiresMenace ? { requiresMenace: c.requiresMenace } : {}),
      ...(c.requiresMenacePair ? { requiresMenacePair: true as const } : {}),
      ...(c.setAside ? { setAside: true as const } : {}),
    })),
    quests: QUESTS.map((q) => ({ id: q.id, renown: q.renown, conditionId: q.conditionId, exclusive: q.exclusive })),
  };
  contentCache.set(mapId, content);
  return content;
}
