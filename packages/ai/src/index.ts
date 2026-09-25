// Heuristic AI players (spec §57). No machine learning: candidate generation,
// one- or two-step lookahead with the evaluator, and a constrained search for
// Banner assignments. The AI returns one command intent at a time so the UI
// can animate each action.

import {
  computeBannerHarvest,
  getLegalActions,
  getLegalBannerRegions,
  getPlayerBanners,
  getLegalInitialManorSites,
  getLegalInitialRoutes,
  holdingAt,
  passesSpacing,
  type BannerId,
  type CommandIntent,
  type GameRng,
  type GameState,
  type PlayerId,
  type RegionId,
  type RulesEngine,
  type RulesContext,
  type SiteId,
  type GameCommand,
} from "@manors-menaces/rules";
import { mainPhaseCandidates } from "./candidates.js";
import { evaluate, resourceNeeds } from "./evaluate.js";
import { regionOccupancy, siteValue } from "./expansion.js";

export { evaluate, resourceNeeds, WEIGHTS } from "./evaluate.js";
export { planExpansion, type ExpansionPlan } from "./expansion.js";
export { mainPhaseCandidates, spareResource } from "./candidates.js";

export type AiLevel = "easy" | "normal" | "hard";

export interface AiOptions {
  level: AiLevel;
  rng: GameRng;
  /** Safety cap on main-phase actions per turn. */
  maxActionsPerTurn?: number;
}

let seq = 0;
function asCommand(state: GameState, playerId: PlayerId, intent: CommandIntent): GameCommand {
  return { ...intent, commandId: `ai-${++seq}`, matchId: state.matchId, playerId } as GameCommand;
}

/** Choose the next action for `playerId`, or null if they have nothing to do. */
export function chooseAction(engine: RulesEngine, state: GameState, playerId: PlayerId, opts: AiOptions): CommandIntent | null {
  const ctx = engine.ctx;
  const legal = getLegalActions(ctx, state, playerId);
  switch (legal.mode) {
    case "none":
    case "finished":
      return null;
    case "setup_manor":
      return { type: "place_initial_manor", siteId: pickInitialSite(ctx, state, playerId, legal.initialManorSites, opts) };
    case "setup_route":
      return { type: "place_initial_route", routeId: pickInitialRoute(ctx, state, playerId, legal.initialRoutes, opts) };
    case "setup_banners":
      return { type: "assign_initial_banners", assignments: optimizeBanners(ctx, state, playerId, opts) };
    case "banner_assignment":
      return { type: "assign_banners", assignments: optimizeBanners(ctx, state, playerId, opts) };
    case "end": {
      const p = state.players[playerId];
      if (legal.mustDiscard > 0 && p) return { type: "discard_cards", cardIds: p.hand.slice(0, legal.mustDiscard) };
      return { type: "end_turn" };
    }
    case "reaction":
      return chooseReaction(state, playerId, legal.reactionCards, opts);
    case "prophecy": {
      const pending = state.pending;
      return { type: "resolve_prophecy", order: pending?.kind === "prophecy" ? [...pending.cardIds] : [] };
    }
    case "main":
      return chooseMainAction(engine, state, playerId, opts);
  }
}

// ------------------------------------------------------------------ main phase

function chooseMainAction(engine: RulesEngine, state: GameState, playerId: PlayerId, opts: AiOptions): CommandIntent {
  const ctx = engine.ctx;
  const endMain: CommandIntent = { type: "end_main_phase" };
  const p = state.players[playerId];
  const actionsSoFar = (p?.marketTradesThisTurn ?? 0) + (p?.writsIssuedThisTurn ?? 0) + (p?.wardensHiredThisTurn ?? 0);
  if (actionsSoFar > (opts.maxActionsPerTurn ?? 12)) return endMain;

  const baseline = evaluate(ctx, state, playerId);
  const candidates = mainPhaseCandidates(ctx, state, playerId, { menaces: opts.level !== "easy" || opts.rng.nextInt(3) === 0, cards: true });
  const scored: { intent: CommandIntent; score: number }[] = [];
  for (const intent of candidates) {
    const r = engine.applyCommand(state, asCommand(state, playerId, intent));
    if (!r.accepted || !r.newState) continue;
    let score = evaluate(ctx, r.newState, playerId);
    // Trades and card purchases rarely pay off alone; look one step further.
    if (opts.level !== "easy" && (intent.type === "trade" || (opts.level === "hard" && intent.type !== "claim_quest"))) {
      score = Math.max(score, bestFollowUp(engine, r.newState, playerId));
    }
    scored.push({ intent, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const threshold = baseline + (opts.level === "easy" ? 0.5 : 0.05);
  const viable = scored.filter((s) => s.score > threshold);
  if (viable.length === 0) return endMain;
  if (opts.level === "easy") {
    const top = viable.slice(0, 3);
    return (top[opts.rng.nextInt(top.length)] as (typeof top)[number]).intent;
  }
  return (viable[0] as (typeof viable)[number]).intent;
}

function bestFollowUp(engine: RulesEngine, state: GameState, playerId: PlayerId): number {
  let best = -Infinity;
  const candidates = mainPhaseCandidates(engine.ctx, state, playerId, { menaces: false, cards: false }).filter(
    (c) => c.type === "build_manor" || c.type === "upgrade_holding" || c.type === "build_route" || c.type === "claim_quest",
  );
  for (const intent of candidates) {
    const r = engine.applyCommand(state, asCommand(state, playerId, intent));
    if (r.accepted && r.newState) best = Math.max(best, evaluate(engine.ctx, r.newState, playerId));
  }
  return best;
}

// ------------------------------------------------------------------ reactions

function chooseReaction(state: GameState, playerId: PlayerId, reactionCards: string[], opts: AiOptions): CommandIntent {
  const pending = state.pending;
  const counter = reactionCards[0];
  if (!counter || pending?.kind !== "reaction") return { type: "pass_reaction" };
  const t = pending.target;
  const hurtsMe =
    (t.effect === "wizard_interference" && state.banners[t.bannerId]?.ownerId === playerId) ||
    (t.effect === "fog_of_confusion" && state.routeOwners[t.routeId] === playerId);
  if (opts.level === "easy") return opts.rng.nextInt(2) === 0 && hurtsMe ? { type: "react", cardId: counter } : { type: "pass_reaction" };
  return hurtsMe ? { type: "react", cardId: counter } : { type: "pass_reaction" };
}

// ------------------------------------------------------------------ setup

function pickInitialSite(ctx: RulesContext, state: GameState, playerId: PlayerId, sites: SiteId[], opts: AiOptions): SiteId {
  const need = resourceNeeds(ctx, state, playerId);
  const occupied = regionOccupancy(state);
  const siteWorth = (siteId: SiteId): number => siteValue(ctx, state, siteId, need, occupied);
  const scored = sites.map((s) => {
    // Look ahead: good expansion sites two routes away.
    let expansion = 0;
    for (const n of ctx.board.neighbours(s))
      for (const m of ctx.board.neighbours(n)) if (m !== s && passesSpacing(ctx, state, m)) expansion = Math.max(expansion, siteWorth(m));
    return { s, v: siteWorth(s) + 0.3 * expansion };
  });
  scored.sort((a, b) => b.v - a.v);
  const pool = opts.level === "easy" ? scored.slice(0, 5) : opts.level === "normal" ? scored.slice(0, 2) : scored.slice(0, 1);
  return (pool[opts.rng.nextInt(pool.length)] as (typeof pool)[number]).s;
}

function pickInitialRoute(ctx: RulesContext, state: GameState, playerId: PlayerId, routes: string[], opts: AiOptions): string {
  const from = state.setup?.lastPlacedSiteId;
  const need = resourceNeeds(ctx, state, playerId);
  const occupied = regionOccupancy(state);
  const scored = routes.map((routeId) => {
    const r = ctx.board.route(routeId);
    const end = from ? ctx.board.otherEnd(r, from) : r.siteB;
    let v = 0;
    for (const n of ctx.board.neighbours(end)) if (n !== from && !holdingAt(state, n) && passesSpacing(ctx, state, n)) v = Math.max(v, siteValue(ctx, state, n, need, occupied));
    return { routeId, v };
  });
  scored.sort((a, b) => b.v - a.v);
  const pool = opts.level === "easy" ? scored : scored.slice(0, 1);
  return (pool[opts.rng.nextInt(pool.length)] as (typeof pool)[number]).routeId;
}

// ------------------------------------------------------------------ banners (§57.3)

/**
 * Best assignment for all of the player's Banners: exhaustive search with
 * pruning when small, greedy improvement otherwise.
 */
export function optimizeBanners(ctx: RulesContext, state: GameState, playerId: PlayerId, opts: AiOptions): Record<BannerId, RegionId | null> {
  const need = resourceNeeds(ctx, state, playerId);
  const banners = getPlayerBanners(state, playerId);
  const valueOf = (bannerId: BannerId, regionId: RegionId | null): number => {
    if (!regionId) return 0;
    const b = state.banners[bannerId];
    if (!b) return 0;
    const h = computeBannerHarvest(ctx, state, b, regionId);
    let v = h.produced && h.amount > 0 ? need[h.produced] * h.amount : 0;
    // Staying put keeps a Banner settled (and harvesting) — a small bonus.
    if (b.regionId === regionId) v += 0.15;
    if (opts.level === "easy") v += opts.rng.nextFloat() * 0.6;
    return v;
  };

  // Start from the current positions, then release everyone and rebuild.
  const draft: Record<BannerId, RegionId | null> = {};
  for (const b of banners) draft[b.id] = null;
  let best: { score: number; assign: Record<BannerId, RegionId | null> } = { score: -1, assign: { ...draft } };
  let budget = opts.level === "hard" ? 60000 : 12000;

  const order = [...banners].sort((a, b) => optionCount(a.id) - optionCount(b.id));
  function optionCount(id: BannerId): number {
    const h = state.holdings[state.banners[id]?.holdingId ?? ""];
    return h ? ctx.board.site(h.siteId).adjacentRegionIds.length : 0;
  }
  const upperBound = (i: number): number => {
    let ub = 0;
    for (let j = i; j < order.length; j++) {
      const b = order[j];
      if (!b) continue;
      const h = state.holdings[b.holdingId];
      if (!h) continue;
      ub += Math.max(0, ...ctx.board.site(h.siteId).adjacentRegionIds.map((r) => valueOf(b.id, r)));
    }
    return ub;
  };
  const dfs = (i: number, score: number): void => {
    if (--budget < 0) return;
    if (i === order.length) {
      if (score > best.score) best = { score, assign: { ...draft } };
      return;
    }
    if (score + upperBound(i) <= best.score) return;
    const b = order[i] as (typeof order)[number];
    const options = getLegalBannerRegions(ctx, state, b.id, draft)
      .map((r) => ({ r, v: valueOf(b.id, r) }))
      .sort((x, y) => y.v - x.v);
    for (const { r, v } of options) {
      draft[b.id] = r;
      dfs(i + 1, score + v);
    }
    draft[b.id] = null;
    dfs(i + 1, score);
  };
  dfs(0, 0);
  // Only send changes.
  const out: Record<BannerId, RegionId | null> = {};
  for (const b of banners) if ((best.assign[b.id] ?? null) !== b.regionId) out[b.id] = best.assign[b.id] ?? null;
  return out;
}

/**
 * Progression moves to try, in order, when an AI choice fails or is
 * rejected, so a seat never stalls the game. Together they cover every
 * decision an actor can owe: a setup placement, a pending reaction or
 * prophecy, the main phase, the Banner assignment, a discard down to the
 * hand limit and the end of the turn. The server and the web client share
 * this list.
 */
export function fallbackIntents(ctx: RulesContext, state: GameState, playerId: PlayerId): CommandIntent[] {
  const hand = state.players[playerId]?.hand ?? [];
  const excess = hand.length - state.ruleset.handLimit;
  const pending = state.pending;
  const setup: CommandIntent[] = [];
  if (state.status === "setup") {
    const legal = getLegalActions(ctx, state, playerId);
    const site = legal.initialManorSites[0];
    const route = legal.initialRoutes[0];
    if (legal.mode === "setup_manor" && site) setup.push({ type: "place_initial_manor", siteId: site });
    if (legal.mode === "setup_route" && route) setup.push({ type: "place_initial_route", routeId: route });
    if (legal.mode === "setup_banners") setup.push({ type: "assign_initial_banners", assignments: {} });
  }
  return [
    ...setup,
    { type: "pass_reaction" },
    ...(pending?.kind === "prophecy" ? [{ type: "resolve_prophecy" as const, order: [...pending.cardIds] }] : []),
    { type: "end_main_phase" },
    { type: "assign_banners", assignments: {} },
    ...(excess > 0 ? [{ type: "discard_cards" as const, cardIds: hand.slice(0, excess) }] : []),
    { type: "end_turn" },
  ];
}

/** Plays AI turns until it is a human's turn or the game ends (for tests/simulation). */
export function runAiUntilHuman(
  engine: RulesEngine,
  state: GameState,
  isAi: (id: PlayerId) => boolean,
  optsFor: (id: PlayerId) => AiOptions,
  maxSteps = 5000,
): { state: GameState; commands: GameCommand[] } {
  let s = state;
  const commands: GameCommand[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const actor = s.pending?.kind === "reaction" ? s.pending.eligiblePlayerIds[0] : s.pending?.kind === "prophecy" ? s.pending.playerId : s.activePlayerId;
    if (!actor || s.status === "finished" || !isAi(actor)) break;
    const intent = chooseAction(engine, s, actor, optsFor(actor));
    if (!intent) break;
    const command = asCommand(s, actor, intent);
    const r = engine.applyCommand(s, command);
    if (!r.accepted || !r.newState) {
      // Fall back to progressing rather than looping on an illegal choice.
      let fallback: { command: GameCommand; state: GameState } | null = null;
      for (const f of fallbackIntents(engine.ctx, s, actor)) {
        const fc = asCommand(s, actor, f);
        const fr = engine.applyCommand(s, fc);
        if (!fr.accepted || !fr.newState) continue;
        fallback = { command: fc, state: fr.newState };
        break;
      }
      if (!fallback) throw new Error(`AI stuck: ${intent.type} → ${r.error?.code}; no fallback accepted`);
      s = fallback.state;
      commands.push(fallback.command);
      continue;
    }
    s = r.newState;
    commands.push(command);
  }
  return { state: s, commands };
}

export { getLegalInitialManorSites, getLegalInitialRoutes };
