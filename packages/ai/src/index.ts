// Heuristic AI players (spec §57). No machine learning: candidate generation,
// one- or two-step lookahead with the evaluator, and a constrained search for
// Banner assignments. The AI returns one command intent at a time so the UI
// can animate each action.

import {
  computeBannerHarvest,
  dragonsLandingTargets,
  getLegalActions,
  getLegalBannerRegions,
  getPlayerBanners,
  getLegalInitialManorSites,
  getLegalInitialRoutes,
  holdingAt,
  insurancePolicyOf,
  passesSpacing,
  plagueBanners,
  rankPlayers,
  redactState,
  seedRng,
  type Banner,
  type BannerId,
  type CardEffectId,
  type CardTarget,
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
import { CARD_GOAL_HAND, cardWorth, evaluate, foresightWorth, resourceNeeds } from "./evaluate.js";
import { counterChance, counteredOutcome } from "./hidden.js";
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
      if (legal.mustDiscard > 0 && p) {
        // Keep the cards worth most; the order of equals stays as held.
        const byWorth = [...p.hand].sort((a, b) => cardWorth(ctx, state, a) - cardWorth(ctx, state, b));
        return { type: "discard_cards", cardIds: byWorth.slice(0, legal.mustDiscard) };
      }
      return { type: "end_turn" };
    }
    case "reaction":
      return chooseReaction(ctx, state, playerId, legal.reactionCards, opts);
    case "prophecy": {
      const pending = state.pending;
      if (pending?.kind !== "prophecy") return { type: "resolve_prophecy", order: [] };
      // The best card on top if this player means to buy next, the worst if a rival will draw first.
      const buyingNext = (state.players[playerId]?.hand.length ?? 0) < CARD_GOAL_HAND;
      const order = [...pending.cardIds].sort((a, b) => (buyingNext ? -1 : 1) * (cardWorth(ctx, state, a) - cardWorth(ctx, state, b)));
      return { type: "resolve_prophecy", order };
    }
    case "main":
      return chooseMainAction(engine, state, playerId, opts);
  }
}

// ------------------------------------------------------------------ main phase

function chooseMainAction(engine: RulesEngine, fullState: GameState, playerId: PlayerId, opts: AiOptions): CommandIntent {
  const ctx = engine.ctx;
  // Plan only on what this player may know (§105): rivals' hands, the draw
  // pile and the RNG state are hidden, so no choice can depend on them.
  const state = redactState(fullState, playerId);
  const endMain: CommandIntent = { type: "end_main_phase" };
  const p = state.players[playerId];
  const actionsSoFar = (p?.marketTradesThisTurn ?? 0) + (p?.writsIssuedThisTurn ?? 0) + (p?.wardensHiredThisTurn ?? 0);
  if (actionsSoFar > (opts.maxActionsPerTurn ?? 12)) return endMain;

  const baseline = evaluate(ctx, state, playerId);
  const candidates = mainPhaseCandidates(ctx, state, playerId, { menaces: opts.level !== "easy" || opts.rng.nextInt(3) === 0, cards: true });
  const scored: { intent: CommandIntent; score: number }[] = [];
  for (const intent of candidates) {
    const results = outcomes(engine, state, playerId, intent);
    if (results.length === 0) continue;
    // Trades (and cards that act like one) and card purchases rarely pay off
    // alone; look one step further.
    const tradeLike = intent.type === "trade" || (intent.type === "play_card" && TRADING_EFFECTS.has(intent.target.effect));
    const lookAhead = opts.level !== "easy" && (tradeLike || (opts.level === "hard" && intent.type !== "claim_quest"));
    const judge = (result: GameState): number => {
      const score = evaluate(ctx, result, playerId);
      return lookAhead ? Math.max(score, bestFollowUp(engine, result, playerId)) : score;
    };
    // Every outcome is equally likely (see `outcomes`).
    let score = results.reduce((sum, result) => sum + judge(result), 0) / results.length;
    // The order of the draw pile is hidden from the evaluator, so what the
    // prophecy reveals is added here.
    if (intent.type === "play_card" && intent.target.effect === "very_minor_prophecy") score += foresightWorth(ctx, state);
    // A Spell may be countered. Rivals' hands are hidden, so weigh that by
    // the chance one of them holds a Counterspell, from public cards only.
    const counterProb = intent.type === "play_card" ? counterChance(ctx, state, playerId, intent.cardId) : 0;
    const countered = counterProb > 0 && intent.type === "play_card" ? counteredOutcome(engine, state, playerId, intent) : null;
    if (countered) score = (1 - counterProb) * score + counterProb * judge(countered);
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

/** Cards that bring in resources, like a trade: judged by what they let the player build next. */
const TRADING_EFFECTS: ReadonlySet<CardEffectId> = new Set(["transmutation_magic", "robin_of_the_glade", "treasure_hunter"]);

/** Most substitute draws per Holding when replaying Dragon's Landing (see `outcomes`). */
const LANDING_TRIES_PER_TARGET = 8;

/**
 * The states `intent` can lead to, all equally likely; empty if the engine
 * rejects it. Most commands have one outcome. Dragon's Landing picks its
 * Holding with the match RNG at resolution, and simulating it on the real
 * state would read that pick off `rngState` in advance. Instead it is
 * replayed under substitute RNG states, seeded from the match and revision
 * and never from `rngState`, until each Holding in the pool has been struck
 * once: the uniform pick makes those outcomes equally likely, so their
 * average is the card's expected worth. The seeds are fixed, so the AI stays
 * deterministic.
 */
function outcomes(engine: RulesEngine, state: GameState, playerId: PlayerId, intent: CommandIntent): GameState[] {
  if (intent.type !== "play_card" || intent.target.effect !== "dragons_landing") {
    const r = engine.applyCommand(state, asCommand(state, playerId, intent));
    return r.accepted && r.newState ? [r.newState] : [];
  }
  const pool = dragonsLandingTargets(state).length;
  const struck = new Map<string, GameState>();
  for (let i = 0; i < pool * LANDING_TRIES_PER_TARGET && struck.size < pool; i++) {
    const trial: GameState = { ...state, rngState: seedRng(`dragons_landing:${state.matchId}:${state.revision}:${i}`) };
    const r = engine.applyCommand(trial, asCommand(trial, playerId, intent));
    if (!r.accepted || !r.newState) return [];
    const landed = r.events.find((e) => e.type === "dragon_landed");
    const holdingId = landed?.type === "dragon_landed" ? landed.holdingId : "";
    if (!struck.has(holdingId)) struck.set(holdingId, r.newState);
  }
  return [...struck.values()];
}

function bestFollowUp(engine: RulesEngine, state: GameState, playerId: PlayerId): number {
  let best = -Infinity;
  // Follow-ups never play cards, and finding the playable ones is the costliest
  // part of getLegalActions (Transmutation Magic alone has 110 targets to
  // check), so the builds are listed from a view with the hand set aside.
  const p = state.players[playerId];
  const handless: GameState = p ? { ...state, players: { ...state.players, [playerId]: { ...p, hand: [] } } } : state;
  const candidates = mainPhaseCandidates(engine.ctx, handless, playerId, { menaces: false, cards: false }).filter(
    (c) => c.type === "build_manor" || c.type === "upgrade_holding" || c.type === "build_route" || c.type === "claim_quest",
  );
  for (const intent of candidates) {
    const r = engine.applyCommand(state, asCommand(state, playerId, intent));
    if (r.accepted && r.newState) best = Math.max(best, evaluate(engine.ctx, r.newState, playerId));
  }
  return best;
}

// ------------------------------------------------------------------ reactions

function chooseReaction(ctx: RulesContext, state: GameState, playerId: PlayerId, reactionCards: string[], opts: AiOptions): CommandIntent {
  const pending = state.pending;
  const counter = reactionCards[0];
  if (!counter || pending?.kind !== "reaction") return { type: "pass_reaction" };
  const hurtsMe = spellHurts(ctx, state, playerId, pending.sourcePlayerId, pending.target);
  if (opts.level === "easy") return opts.rng.nextInt(2) === 0 && hurtsMe ? { type: "react", cardId: counter } : { type: "pass_reaction" };
  return hurtsMe ? { type: "react", cardId: counter } : { type: "pass_reaction" };
}

/** Whether `casterId`'s pending Spell is worth a Counterspell to `playerId`. */
function spellHurts(ctx: RulesContext, state: GameState, playerId: PlayerId, casterId: PlayerId, t: CardTarget): boolean {
  // A Royal Insurance Policy already stops the next of these (§19.19).
  const insured = (id: PlayerId): boolean => insurancePolicyOf(ctx, state, id) !== undefined;
  switch (t.effect) {
    case "wizard_interference":
      return state.banners[t.bannerId]?.ownerId === playerId;
    case "fog_of_confusion":
      return state.routeOwners[t.routeId] === playerId;
    case "fire_bolt":
      return state.routeOwners[t.routeId] === playerId && !insured(playerId);
    case "changeling": {
      if (t.opponentId !== playerId || insured(playerId)) return false;
      // Hands are hidden, so judge them by size, as `evaluate` does. Countering
      // costs the Counterspell; letting the swap through trades my whole hand,
      // Counterspell included, for theirs. Let it through only for at least
      // as many cards as I hold now.
      const mine = state.players[playerId]?.hand.length ?? 0;
      const theirs = state.players[casterId]?.hand.length ?? 0;
      return theirs < mine;
    }
    case "the_plague": {
      // Banners of `id` that would have produced something; a policy spares them all.
      const sickened = (id: PlayerId): number =>
        insured(id) ? 0 : plagueBanners(ctx, state, t.siteId).filter((b) => b.ownerId === id && producing(ctx, state, b)).length;
      const mine = sickened(playerId);
      return mine > 0 && mine > sickened(casterId);
    }
    case "ragnarok":
      // The game ends at once: stop it unless it ends in my favour.
      return rankPlayers(ctx, state, state.turnOrder)[0] !== playerId;
    default:
      return false;
  }
}

/** Whether the Banner would produce anything where it stands. */
function producing(ctx: RulesContext, state: GameState, banner: Banner): boolean {
  return banner.regionId !== null && computeBannerHarvest(ctx, state, banner, banner.regionId).amount > 0;
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
