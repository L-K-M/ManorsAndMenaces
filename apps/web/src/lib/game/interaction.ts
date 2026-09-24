// Maps the current mode/tool to board highlights, and board picks to
// commands. All legality comes from rules selectors (spec §103).

import { spareResource } from "@manors-menaces/ai";
import {
  checkBuildManor,
  checkBuildRoute,
  checkUpgrade,
  enumerateCardTargets,
  getLegalActions,
  getLegalBannerRegions,
  getLegalMenaceDestinations,
  getPlayerBanners,
  type CardTarget,
  type CommandIntent,
  type LegalActionSummary,
  type MenaceLocation,
  type ResourceType,
} from "@manors-menaces/rules";
import { CARD_STEPS, locationKey, remainingTargets, resetTool, ui, valueKey, type Pick } from "../stores/ui.svelte.js";
import type { GameSession } from "./session.svelte.js";

export interface Highlights {
  sites: Set<string>;
  routes: Set<string>;
  regions: Set<string>;
  banners: Set<string>;
  menaces: Set<string>;
  /** Menace destinations, as location keys. */
  locations: Set<string>;
  /** Short instruction for the current step. */
  hint: string | null;
}

const empty = (): Highlights => ({ sites: new Set(), routes: new Set(), regions: new Set(), banners: new Set(), menaces: new Set(), locations: new Set(), hint: null });

export function legalFor(session: GameSession): LegalActionSummary | null {
  const actor = session.localActor;
  return actor ? getLegalActions(session.ctx, session.draft, actor) : null;
}

export function computeHighlights(session: GameSession, legal: LegalActionSummary | null): Highlights {
  const h = empty();
  if (!legal) return h;
  const ctx = session.ctx;
  const state = session.draft;
  switch (legal.mode) {
    case "setup_manor":
      legal.initialManorSites.forEach((s) => h.sites.add(s));
      h.hint = "hint.setup_manor";
      return h;
    case "setup_route":
      legal.initialRoutes.forEach((r) => h.routes.add(r));
      h.hint = "hint.setup_route";
      return h;
    case "setup_banners":
    case "banner_assignment": {
      for (const b of getPlayerBanners(state, legal.playerId)) h.banners.add(b.id);
      if (ui.selectedBannerId) {
        getLegalBannerRegions(ctx, state, ui.selectedBannerId, ui.bannerDraft).forEach((r) => h.regions.add(r));
        h.hint = "hint.banner_region";
      } else h.hint = "hint.banner_select";
      return h;
    }
    case "main":
      break;
    default:
      return h;
  }
  switch (ui.tool) {
    case "route":
      legal.routes.forEach((r) => h.routes.add(r));
      h.hint = "hint.route";
      break;
    case "manor":
      legal.manorSites.forEach((s) => h.sites.add(s));
      h.hint = "hint.manor";
      break;
    case "upgrade":
      legal.upgradeSites.forEach((s) => h.sites.add(s));
      h.hint = "hint.upgrade";
      break;
    case "writ":
      legal.writTargets.forEach((b) => h.banners.add(b));
      h.hint = "hint.writ";
      break;
    case "warden":
      if (!ui.selectedMenaceId) {
        legal.wardenMenaces.forEach((m) => h.menaces.add(m));
        h.hint = "hint.warden_menace";
      } else {
        getLegalMenaceDestinations(ctx, state, ui.selectedMenaceId).forEach((d) => h.locations.add(locationKey(d)));
        h.hint = "hint.warden_destination";
      }
      break;
    case "card": {
      const step = currentCardStep(session);
      if (!step) break;
      h.hint = `hint.card_${step.pick}`;
      for (const value of step.options) {
        switch (step.pick) {
          case "banner":
            h.banners.add(String(value));
            break;
          case "region":
            h.regions.add(String(value));
            break;
          case "menace":
            h.menaces.add(String(value));
            break;
          case "route":
            h.routes.add(String(value));
            break;
          case "location":
            h.locations.add(valueKey(value));
            break;
        }
      }
      break;
    }
    case "none":
      break;
  }
  return h;
}

export function cardCandidates(session: GameSession): CardTarget[] {
  const actor = session.localActor;
  if (!actor || !ui.cardId) return [];
  return enumerateCardTargets(session.ctx, session.draft, actor, ui.cardId);
}

/** The next board pick the selected card needs, with its legal options. */
export function currentCardStep(session: GameSession): { field: string; pick: string; options: unknown[] } | null {
  if (!ui.cardId) return null;
  const candidates = remainingTargets(cardCandidates(session), ui.cardPicks);
  const def = session.ctx.cardOf(ui.cardId);
  const steps = CARD_STEPS[def.effectId as CardTarget["effect"]] ?? [];
  for (const s of steps) {
    if (s.field in ui.cardPicks) continue;
    const seen = new Map<string, unknown>();
    for (const c of candidates) {
      const v = (c as unknown as Record<string, unknown>)[s.field];
      seen.set(valueKey(v), v);
    }
    return { field: s.field, pick: s.pick, options: [...seen.values()] };
  }
  return null;
}

/** Start playing a card: resolves immediately when it needs no targets. */
export async function startCard(session: GameSession, cardId: string): Promise<void> {
  resetTool();
  ui.tool = "card";
  ui.cardId = cardId;
  await maybeFinishCard(session);
}

async function maybeFinishCard(session: GameSession): Promise<void> {
  const step = currentCardStep(session);
  if (step?.pick === "dialog") {
    const effect = session.ctx.cardOf(ui.cardId ?? "").effectId;
    ui.dialog = effect === "arcane_exchange" ? "arcane" : "festival";
    return;
  }
  if (step) return;
  const remaining = remainingTargets(cardCandidates(session), ui.cardPicks);
  const target = remaining[0];
  if (!target || !ui.cardId) return resetTool();
  const cardId = ui.cardId;
  resetTool();
  await session.perform({ type: "play_card", cardId, target });
}

/** Complete a card's dialog step (Arcane Exchange / Festival). */
export async function finishCardWith(session: GameSession, fields: Record<string, unknown>): Promise<void> {
  ui.cardPicks = { ...ui.cardPicks, ...fields };
  ui.dialog = null;
  await maybeFinishCard(session);
}

function toll(session: GameSession, cost: Partial<Record<ResourceType, number>>): ResourceType | undefined {
  const actor = session.localActor;
  return actor ? (spareResource(session.draft, actor, cost) ?? undefined) : undefined;
}

/** Handle a click/tap/Enter on a board entity. */
export async function onPick(session: GameSession, legal: LegalActionSummary | null, pick: Pick): Promise<void> {
  if (!legal) {
    ui.inspect = pick;
    return;
  }
  const state = session.draft;
  const ctx = session.ctx;
  switch (legal.mode) {
    case "setup_manor":
      if (pick.kind === "site" && legal.initialManorSites.includes(pick.id)) await session.perform({ type: "place_initial_manor", siteId: pick.id });
      else ui.inspect = pick;
      return;
    case "setup_route":
      if (pick.kind === "route" && legal.initialRoutes.includes(pick.id)) await session.perform({ type: "place_initial_route", routeId: pick.id });
      else ui.inspect = pick;
      return;
    case "setup_banners":
    case "banner_assignment": {
      if (pick.kind === "banner" && state.banners[pick.id]?.ownerId === legal.playerId) {
        ui.selectedBannerId = ui.selectedBannerId === pick.id ? null : pick.id;
        return;
      }
      if (pick.kind === "region" && ui.selectedBannerId) {
        const legalRegions = getLegalBannerRegions(ctx, state, ui.selectedBannerId, ui.bannerDraft);
        if (legalRegions.includes(pick.id)) {
          ui.bannerDraft = { ...ui.bannerDraft, [ui.selectedBannerId]: pick.id };
          ui.selectedBannerId = null;
          return;
        }
      }
      ui.inspect = pick;
      return;
    }
    case "main":
      break;
    default:
      ui.inspect = pick;
      return;
  }

  let intent: CommandIntent | null = null;
  switch (ui.tool) {
    case "route":
      if (pick.kind === "route" && legal.routes.includes(pick.id)) {
        const c = checkBuildRoute(ctx, state, legal.playerId, pick.id);
        const t = c.legal && c.needsToll ? toll(session, c.cost) : undefined;
        intent = { type: "build_route", routeId: pick.id, ...(t ? { tollPayment: t } : {}) };
      }
      break;
    case "manor":
      if (pick.kind === "site" && legal.manorSites.includes(pick.id)) {
        const c = checkBuildManor(ctx, state, legal.playerId, pick.id);
        const t = c.legal && c.needsToll ? toll(session, c.cost) : undefined;
        const g = c.legal && c.needsSurcharge ? toll(session, { ...c.cost, ...(t ? { [t]: (c.cost[t] ?? 0) + 1 } : {}) }) : undefined;
        intent = { type: "build_manor", siteId: pick.id, ...(t ? { tollPayment: t } : {}), ...(g ? { extraPayment: g } : {}) };
      }
      break;
    case "upgrade":
      if (pick.kind === "site" && legal.upgradeSites.includes(pick.id)) {
        const c = checkUpgrade(state, legal.playerId, pick.id);
        const g = c.legal && c.needsSurcharge ? toll(session, c.cost) : undefined;
        intent = { type: "upgrade_holding", siteId: pick.id, ...(g ? { extraPayment: g } : {}) };
      }
      break;
    case "writ":
      if (pick.kind === "banner" && legal.writTargets.includes(pick.id)) {
        ui.writTargetId = pick.id;
        ui.dialog = "writ";
        return;
      }
      break;
    case "warden":
      if (!ui.selectedMenaceId && pick.kind === "menace" && legal.wardenMenaces.includes(pick.id)) {
        ui.selectedMenaceId = pick.id;
        return;
      }
      if (ui.selectedMenaceId) {
        const dest = pickToLocation(pick);
        if (dest && getLegalMenaceDestinations(ctx, state, ui.selectedMenaceId).some((d) => locationKey(d) === locationKey(dest)))
          intent = { type: "hire_warden", menaceId: ui.selectedMenaceId, destination: dest };
      }
      break;
    case "card": {
      const step = currentCardStep(session);
      if (!step) break;
      const value = pickValue(step.pick, pick);
      if (value !== undefined && step.options.some((o) => valueKey(o) === valueKey(value))) {
        ui.cardPicks = { ...ui.cardPicks, [step.field]: value };
        await maybeFinishCard(session);
        return;
      }
      break;
    }
    case "none":
      ui.inspect = pick;
      return;
  }
  if (intent) {
    const tool = ui.tool;
    const ok = await session.perform(intent);
    if (ok && (tool === "warden" || tool === "upgrade")) resetTool();
    else if (ok) ui.selectedMenaceId = null;
  } else {
    ui.inspect = pick;
  }
}

function pickToLocation(pick: Pick): MenaceLocation | null {
  switch (pick.kind) {
    case "region":
      return { kind: "region", regionId: pick.id };
    case "route":
      return { kind: "route", routeId: pick.id };
    case "site":
      return { kind: "site", siteId: pick.id };
    case "location":
      return pick.location;
    default:
      return null;
  }
}

function pickValue(kind: string, pick: Pick): unknown {
  if (kind === "location") return pickToLocation(pick) ?? undefined;
  if (pick.kind !== kind) return undefined;
  return "id" in pick ? pick.id : undefined;
}

/** Confirm the Banner draft (setup or Banner Assignment phase). */
export async function confirmBanners(session: GameSession, legal: LegalActionSummary): Promise<void> {
  const changes: Record<string, string | null> = {};
  for (const [b, r] of Object.entries(ui.bannerDraft)) if (session.draft.banners[b]?.regionId !== r) changes[b] = r;
  const ok = await session.perform(
    legal.mode === "setup_banners" ? { type: "assign_initial_banners", assignments: changes } : { type: "assign_banners", assignments: changes },
  );
  if (ok) {
    ui.bannerDraft = {};
    ui.selectedBannerId = null;
  }
}
