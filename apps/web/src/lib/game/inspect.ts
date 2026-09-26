// Plain-text descriptions of board entities, shared by the inspector panel
// and the board's hover card.

import type { MapDefinition } from "@manors-menaces/content";
import type { Banner, GameState } from "@manors-menaces/rules";
import { t } from "../i18n.js";
import type { Pick } from "../stores/ui.svelte.js";
import { regionName } from "./log.js";

export interface Description {
  title: string;
  lines: string[];
}

/** Where a Banner currently stands; the board passes its assignment draft. */
export type BannerRegionOf = (banner: Banner) => string | null;

const committedRegion: BannerRegionOf = (b) => b.regionId;

/** Sick with the Plague: the Banner produces nothing at its owner's next Harvest. */
function isSick(s: GameState, bannerId: string): boolean {
  return s.activeEffects.some((e) => e.kind === "sick" && e.bannerId === bannerId);
}

/** The burned Route's former owner, while only they may rebuild it (Fire Bolt). */
function smoulderingOwner(s: GameState, routeId: string): string | null {
  for (const e of s.activeEffects) if (e.kind === "smouldering" && e.routeId === routeId) return e.ownerId;
  return null;
}

export function describePick(map: MapDefinition, s: GameState, p: Pick, bannerRegion: BannerRegionOf = committedRegion): Description | null {
  const playerName = (id: string) => s.players[id]?.displayName ?? "";
  const occupant = (b: Banner) => {
    const name = playerName(b.ownerId);
    if (isSick(s, b.id)) return t("inspect.sick_banner", { name });
    return b.settled ? name : t("inspect.unsettled", { name });
  };
  switch (p.kind) {
    case "region": {
      const r = map.regions.find((x) => x.id === p.id);
      if (!r) return null;
      const occ = Object.values(s.banners).filter((b) => bannerRegion(b) === r.id);
      const menace = Object.values(s.menaces).find((m) => m.location.kind === "region" && m.location.regionId === r.id);
      const resource = t(`resource.${r.resource}`);
      return {
        title: r.name,
        lines: [
          t(r.capacity > 1 ? "inspect.region_rich" : "inspect.region", { resource, capacity: r.capacity }),
          occ.length
            ? t("inspect.banners", {
                list: occ.map(occupant).join(", "),
              })
            : t("inspect.no_banners"),
          ...(menace ? [`${t(`menace.${menace.type}.name`)}: ${t(`menace.${menace.type}.rules`)}`] : []),
        ],
      };
    }
    case "site": {
      const site = map.sites.find((x) => x.id === p.id);
      if (!site) return null;
      const h = Object.values(s.holdings).find((x) => x.siteId === site.id);
      return {
        title: site.landmarkId ? t(`landmark.${site.landmarkId}`) : h ? t(`holding.${h.type}`) : t("inspect.site"),
        lines: [
          h ? t("inspect.holding_of", { holding: t(`holding.${h.type}`), name: playerName(h.ownerId) }) : t("inspect.empty_site"),
          t("inspect.touches", { list: site.adjacentRegionIds.map((r) => regionName(map, r)).join(", ") }),
          ...(site.tradePost ? [t("inspect.trade_post", { resource: t(`resource.${site.tradePost.resource}`) })] : []),
        ],
      };
    }
    case "menace": {
      const m = s.menaces[p.id];
      if (!m) return null;
      const hoard = Object.entries(m.state.hoard ?? {}).filter(([, n]) => (n ?? 0) > 0);
      return {
        title: t(`menace.${m.type}.name`),
        lines: [
          t(`menace.${m.type}.rules`),
          `“${t(`menace.${m.type}.flavor`)}”`,
          ...(hoard.length ? [t("inspect.hoard", { list: hoard.map(([r, n]) => `${n} ${t(`resource.${r}`)}`).join(", ") })] : []),
        ],
      };
    }
    case "banner": {
      const b = s.banners[p.id];
      if (!b) return null;
      const where = bannerRegion(b);
      return {
        title: t("inspect.banner_title", { name: playerName(b.ownerId) }),
        lines: [
          where ? t("inspect.banner_in", { region: regionName(map, where) }) : t("inspect.banner_home"),
          t(b.settled ? "inspect.banner_settled" : "inspect.banner_unsettled"),
          ...(isSick(s, b.id) ? [t("inspect.banner_sick", { name: playerName(b.ownerId) })] : []),
        ],
      };
    }
    case "route": {
      const route = map.routes.find((x) => x.id === p.id);
      const owner = s.routeOwners[p.id];
      const embers = smoulderingOwner(s, p.id);
      const smoulder = embers && t(s.activePlayerId === embers ? "inspect.smouldering_now" : "inspect.smouldering", { name: playerName(embers) });
      return {
        title: route ? t(`route.${route.kind}`) : t("inspect.route"),
        lines: [owner ? t("inspect.owned_by", { name: playerName(owner) }) : t("inspect.unowned"), ...(smoulder ? [smoulder] : []), t("cost.route")],
      };
    }
    default:
      return null;
  }
}
