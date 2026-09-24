import type {
  CardEffectId,
  CardTiming,
  CardType,
  LandmarkId,
  MenaceLocation,
  MenaceType,
  QuestConditionId,
  RegionId,
  ResourceType,
  RouteId,
  SiteId,
  TradePost,
} from "@manors-menaces/rules";

// Map authoring format (spec §101). Includes geometry for the renderer; the
// rules engine only receives the topology projection (see toBoardTopology).

export interface SiteDefinition {
  id: SiteId;
  x: number;
  y: number;
  adjacentRegionIds: RegionId[];
  landmarkId?: LandmarkId;
  tradePost?: TradePost;
}

export interface RouteDefinition {
  id: RouteId;
  siteA: SiteId;
  siteB: SiteId;
  kind: "road" | "bridge" | "trail" | "pass";
}

export interface RegionDefinition {
  id: RegionId;
  /** Display name (English); localized via i18n key `region.<id>` when present. */
  name: string;
  resource: ResourceType;
  capacity: number;
  path: string;
  labelX: number;
  labelY: number;
  adjacentSiteIds: SiteId[];
}

export interface LandmarkDefinition {
  id: LandmarkId;
  name: string;
  siteId: SiteId;
}

export interface MapDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  coastline: string;
  sites: SiteDefinition[];
  routes: RouteDefinition[];
  regions: RegionDefinition[];
  landmarks: LandmarkDefinition[];
  menaceStarts: { menaceType: MenaceType; location: MenaceLocation }[];
  questParams: { kingsHighway: [SiteId, SiteId] };
}

// Content definitions (spec §39–41). Text is referenced by localization key.

export interface CardDefinition {
  id: string;
  nameKey: string;
  type: CardType;
  rulesTextKey: string;
  flavorTextKey?: string;
  timing: CardTiming[];
  tags: string[];
  effectId: CardEffectId;
  copies: number;
  requiresMenace?: MenaceType;
}

export interface QuestDefinition {
  id: string;
  nameKey: string;
  renown: number;
  descriptionKey: string;
  conditionId: QuestConditionId;
  exclusive: boolean;
}

export interface MenaceDefinition {
  type: MenaceType;
  nameKey: string;
  locationType: "region" | "route" | "site";
  rulesTextKey: string;
  flavorTextKey?: string;
}
