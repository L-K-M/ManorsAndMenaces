import { createRng, seedRng } from "@manors-menaces/rules";
import { recentCache } from "./cache.js";
import { drawLayout } from "./layout.js";
import { GREENVALE_MAP } from "./maps/greenvale.js";
import { ASHMERE_MAP } from "./maps/ashmere.js";
import { BRIGHTWATER_MAP } from "./maps/brightwater.js";
import { DUNMARROW_MAP } from "./maps/dunmarrow.js";
import { EMBERREACH_MAP } from "./maps/emberreach.js";
import { HOLLOWMERE_MAP } from "./maps/hollowmere.js";
import { KINGSBARROW_MAP } from "./maps/kingsbarrow.js";
import { MISTHOLM_MAP } from "./maps/mistholm.js";
import { RAVENSHOLT_MAP } from "./maps/ravensholt.js";
import { SILVERFEN_MAP } from "./maps/silverfen.js";
import { STAGMOOR_MAP } from "./maps/stagmoor.js";
import { THORNWOLD_MAP } from "./maps/thornwold.js";
import { WYRMSEND_MAP } from "./maps/wyrmsend.js";
import { LEGACY_GREENVALE_MAP } from "./maps/greenvale-legacy.js";
import type { MapDefinition } from "./types.js";

// Which map a game is played on. A published map is named by its id; a game
// on a layout drawn for it (layout.ts) by `<island id>@<layout number>`, which
// saves, the server and the AI worker carry like any other map id.

/** The islands new games are drawn from (§11). */
export const ISLANDS: readonly MapDefinition[] = [
  GREENVALE_MAP,
  ASHMERE_MAP,
  BRIGHTWATER_MAP,
  DUNMARROW_MAP,
  EMBERREACH_MAP,
  HOLLOWMERE_MAP,
  KINGSBARROW_MAP,
  MISTHOLM_MAP,
  RAVENSHOLT_MAP,
  SILVERFEN_MAP,
  STAGMOOR_MAP,
  THORNWOLD_MAP,
  WYRMSEND_MAP,
];

/** Every published map a save or match may name, whether or not new games still use it. */
export const MAPS: Record<string, MapDefinition> = Object.fromEntries([...ISLANDS, LEGACY_GREENVALE_MAP].map((m) => [m.id, m]));

/** Drawn layouts kept ready; see recentCache. */
const DRAWN_MAPS_KEPT = 64;
const drawn = recentCache<MapDefinition>(DRAWN_MAPS_KEPT);

/** A map id, a layout in canonical decimal form (0 to 2^32 - 1) optional. */
const MAP_ID = /^([a-z0-9-]+)(?:@(0|[1-9]\d{0,9}))?$/;
const MAX_LAYOUT = 0xffffffff;

export interface ParsedMapId {
  islandId: string;
  /** Null for a map as published. */
  layout: number | null;
}

/** Splits a map id into its island and layout, or null when it is not one. */
export function parseMapId(mapId: string): ParsedMapId | null {
  const match = MAP_ID.exec(mapId);
  if (!match) return null;
  const [, islandId = "", digits] = match;
  if (digits === undefined) return { islandId, layout: null };
  const layout = Number(digits);
  return layout <= MAX_LAYOUT ? { islandId, layout } : null;
}

/** The map a game names, or undefined for an id no map answers to. */
export function mapById(mapId: string): MapDefinition | undefined {
  const parsed = parseMapId(mapId);
  if (!parsed) return undefined;
  if (parsed.layout === null) return Object.hasOwn(MAPS, mapId) ? MAPS[mapId] : undefined;
  const island = ISLANDS.find((i) => i.id === parsed.islandId);
  if (!island) return undefined;
  const cached = drawn.get(mapId);
  if (cached) return cached;
  const map = drawLayout(island, parsed.layout);
  drawn.set(mapId, map);
  return map;
}

/**
 * The map for a new game: an island (a random one unless `islandId` names
 * one) and a layout of it, both drawn from the game's seed, so the same seed
 * gives the same map.
 */
export function mapIdForNewGame(seed: string, islandId?: string): string {
  const rng = createRng(seedRng(`${seed}:map`));
  const drawnIsland = rng.pick(ISLANDS);
  const island = islandId === undefined ? drawnIsland : ISLANDS.find((i) => i.id === islandId);
  if (!island) throw new Error(`${islandId} is not an island new games can use`);
  return `${island.id}@${rng.nextUint32()}`;
}
