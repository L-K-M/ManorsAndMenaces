// Maps the current mode/tool to board highlights, and board picks to
// commands. All legality comes from rules selectors (spec §103).

import { spareResource } from "@manors-menaces/ai";
import {
  checkBuildManor,
  checkBuildRoute,
  checkUpgrade,
  dragonsLandingTargets,
  enumerateCardTargets,
  getActionAvailability,
  getBannerRegionOptions,
  getLegalActions,
  getLegalBannerRegions,
  getLegalMenaceDestinations,
  getPlayerBanners,
  getRenown,
  insurancePolicyOf,
  plagueBanners,
  type ActionAvailability,
  type BannerId,
  type BannerRegionOption,
  type CardTarget,
  type CommandIntent,
  type GameState,
  type HoldingId,
  type LegalActionSummary,
  type MenaceLocation,
  type PlayerAction,
  type PlayerId,
  type ResourceType,
  type RulesContext,
  type SiteId,
} from "@manors-menaces/rules";
import {
  CARD_STEPS,
  CONFIRMED_CARDS,
  isCardDialog,
  locationKey,
  remainingTargets,
  resetTool,
  ui,
  valueKey,
  type Pick,
  type TargetField,
} from "../stores/ui.svelte.js";
import { listText } from "./feed.js";
import { regionName } from "./log.js";
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
  /** Parameters for `hint`. */
  hintParams: Record<string, string | number>;
}

const empty = (): Highlights => ({
  sites: new Set(),
  routes: new Set(),
  regions: new Set(),
  banners: new Set(),
  menaces: new Set(),
  locations: new Set(),
  hint: null,
  hintParams: {},
});

export function legalFor(session: GameSession): LegalActionSummary | null {
  const actor = session.localActor;
  return actor ? getLegalActions(session.ctx, session.draft, actor) : null;
}

/** Label keys of the Main-phase actions. */
export const ACTION_LABEL: Record<PlayerAction, string> = {
  route: "action.build_route",
  manor: "action.build_manor",
  upgrade: "action.upgrade",
  market: "action.trade",
  writ: "action.royal_writ",
  warden: "action.warden",
  card: "action.buy_card",
};

/** Why each Main-phase action is (un)available, or null outside the Main phase. */
export function availabilityFor(session: GameSession, legal: LegalActionSummary | null): Record<PlayerAction, ActionAvailability> | null {
  if (legal?.mode !== "main") return null;
  return getActionAvailability(session.ctx, session.draft, legal.playerId);
}

/**
 * Start an action from the action bar: board tools are armed for picking,
 * the Market opens and a card is bought straight away.
 */
export async function startAction(session: GameSession, action: PlayerAction): Promise<void> {
  if (action === "market") {
    resetTool();
    ui.marketGoal = null;
    ui.dialog = "market";
    return;
  }
  if (action === "card") {
    await session.perform({ type: "buy_card" });
    return;
  }
  if (ui.tool === action) return resetTool();
  resetTool();
  ui.tool = action;
}

/** Open the Market set up for the trades that make `action` affordable. */
export function tradeToAfford(action: PlayerAction): void {
  resetTool();
  ui.marketGoal = action;
  ui.dialog = "market";
}

/**
 * Says why a Banner has no Region to go to. Only a Banner at home can get
 * here: a placed Banner may always stay where it is.
 */
function explainNoRoom(session: GameSession, options: readonly BannerRegionOption[], h: Highlights): void {
  const ownFull = options.filter((o) => o.blockedBy === "full_own").map((o) => regionName(session.map, o.regionId));
  if (ownFull.length > 0) {
    h.hint = "hint.banner_blocked_own";
    h.hintParams = { regions: listText(ownFull) };
    return;
  }
  h.hint = options.some((o) => o.blockedBy === "stronghold_pair") ? "hint.banner_blocked_pair" : "hint.banner_blocked_full";
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
      if (!ui.selectedBannerId) {
        h.hint = "hint.banner_select";
        return h;
      }
      const options = getBannerRegionOptions(ctx, state, ui.selectedBannerId, ui.bannerDraft);
      for (const o of options) if (o.blockedBy === null) h.regions.add(o.regionId);
      if (h.regions.size > 0) h.hint = "hint.banner_region";
      else explainNoRoom(session, options, h);
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
      if (!step) {
        // Awaiting confirmation: The Plague shows the Banners it would sicken.
        const target = ui.dialog === "card_confirm" ? pendingCardTarget(session) : undefined;
        if (target?.effect === "the_plague") {
          h.sites.add(target.siteId);
          for (const v of plagueVictims(ctx, state, target.siteId)) if (!v.insured) v.ids.forEach((b) => h.banners.add(b));
        }
        break;
      }
      // A dialog step is its own instruction.
      if (isCardDialog(step.pick)) break;
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
          case "site":
            h.sites.add(String(value));
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

/** The next pick (board or dialog) the selected card needs, with its legal options. */
export function currentCardStep(session: GameSession): (TargetField & { options: unknown[] }) | null {
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
    // An optional field (e.g. Dragon Whisperer's `take`) is skipped when no
    // candidate offers it: a single-type or empty Hoard needs no choice.
    if ([...seen.values()].every((v) => v === undefined)) continue;
    return { field: s.field, pick: s.pick, options: [...seen.values()].filter((v) => v !== undefined) };
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

/** Open the next step's dialog, wait for a board pick, confirm, or play the card. */
async function maybeFinishCard(session: GameSession): Promise<void> {
  const step = currentCardStep(session);
  if (step && isCardDialog(step.pick)) {
    ui.dialog = step.pick;
    return;
  }
  if (step) return;
  const target = pendingCardTarget(session);
  if (!target || !ui.cardId) return resetTool();
  if (CONFIRMED_CARDS.has(target.effect)) {
    ui.dialog = "card_confirm";
    return;
  }
  await playPickedCard(session);
}

/** The target the picks so far settle on, once no pick is left. */
export function pendingCardTarget(session: GameSession): CardTarget | undefined {
  return remainingTargets(cardCandidates(session), ui.cardPicks)[0];
}

/** Play the selected card at the picked target (from the confirmation dialog, say). */
export async function playPickedCard(session: GameSession): Promise<void> {
  const target = pendingCardTarget(session);
  const cardId = ui.cardId;
  resetTool();
  if (!target || !cardId) return;
  await session.perform({ type: "play_card", cardId, target });
}

/** Complete a card's dialog step with the fields it picked. */
export async function finishCardWith(session: GameSession, fields: Record<string, unknown>): Promise<void> {
  ui.cardPicks = { ...ui.cardPicks, ...fields };
  ui.dialog = null;
  await maybeFinishCard(session);
}

/**
 * Take back the last step's pick (and anything its dialog picked with it):
 * the card stays selected and that step is offered again.
 */
export function backCardStep(session: GameSession): void {
  if (!ui.cardId) return;
  const steps = CARD_STEPS[session.ctx.cardOf(ui.cardId).effectId as CardTarget["effect"]] ?? [];
  const kept = steps.filter((s) => s.field in ui.cardPicks).slice(0, -1);
  ui.cardPicks = Object.fromEntries(kept.map((s) => [s.field, ui.cardPicks[s.field]]));
  const step = currentCardStep(session);
  ui.dialog = step && isCardDialog(step.pick) ? step.pick : null;
}

// ------------------------------------------------------------------ card previews
// What a card would do, spelled out in its dialogs. They read public
// information only, so they hold on an online player's redacted view.

/** One player's share of a card's effect: their pieces it would hit. */
export interface CardVictim<Id extends string> {
  ownerId: PlayerId;
  ids: Id[];
  /** A Royal Insurance Policy would spare them, and be used up (§19.19). */
  insured: boolean;
}

function byOwner<Id extends string>(ctx: RulesContext, state: GameState, pieces: { id: Id; ownerId: PlayerId }[]): CardVictim<Id>[] {
  return state.turnOrder
    .map((ownerId) => ({ ownerId, ids: pieces.filter((p) => p.ownerId === ownerId).map((p) => p.id), insured: !!insurancePolicyOf(ctx, state, ownerId) }))
    .filter((v) => v.ids.length > 0);
}

/** The Banners The Plague at `siteId` would sicken, by owner in turn order (§19.17). */
export function plagueVictims(ctx: RulesContext, state: GameState, siteId: SiteId): CardVictim<BannerId>[] {
  return byOwner(ctx, state, plagueBanners(ctx, state, siteId));
}

/** The Holdings Dragon's Landing picks from at random, by owner in turn order (§19.15). */
export function landingRisks(ctx: RulesContext, state: GameState): CardVictim<HoldingId>[] {
  return byOwner(ctx, state, dragonsLandingTargets(state));
}

/** The rivals who would each give Robin of the Glade's player 1 `resource` (§19.18). */
export function robinPayers(ctx: RulesContext, state: GameState, playerId: PlayerId, resource: ResourceType): PlayerId[] {
  const mine = getRenown(ctx, state, playerId);
  return state.turnOrder.filter((id) => id !== playerId && getRenown(ctx, state, id) > mine && (state.players[id]?.resources[resource] ?? 0) > 0);
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
export async function confirmBanners(session: GameSession, legal: LegalActionSummary): Promise<boolean> {
  const changes: Record<string, string | null> = {};
  for (const [b, r] of Object.entries(ui.bannerDraft)) {
    const banner = session.draft.banners[b];
    if (banner?.ownerId === legal.playerId && banner.regionId !== r) changes[b] = r;
  }
  const ok = await session.perform(
    legal.mode === "setup_banners" ? { type: "assign_initial_banners", assignments: changes } : { type: "assign_banners", assignments: changes },
  );
  if (ok) {
    ui.bannerDraft = {};
    ui.selectedBannerId = null;
  }
  return ok;
}

/**
 * Banner Assignment fast path: confirm the draft and end the turn in one step.
 * Stops in the End phase when cards must be discarded first.
 */
export async function confirmBannersAndEndTurn(session: GameSession, legal: LegalActionSummary): Promise<void> {
  if (!(await confirmBanners(session, legal))) return;
  const next = legalFor(session);
  if (next?.mode === "end" && next.mustDiscard === 0) await session.perform({ type: "end_turn" });
}
