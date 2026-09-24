// The deterministic rules engine (spec §34–36). Every function is pure: the
// input state is never mutated, and the same state + command always produces
// the same result.

import { clone } from "./clone.js";
import { BALANCE } from "./balance.js";
import { isReactionOnly, resolveCardEffect, validateCardTarget } from "./cards.js";
import type { DebugCommand, GameCommand } from "./commands.js";
import { createContext, type RulesContext } from "./context.js";
import { check, OK, RuleViolation, type RuleError, type RuleValidation } from "./errors.js";
import type { GameEvent } from "./events.js";
import { getQuestProgress } from "./quests.js";
import { emptyResources, isResourceType, totalResources } from "./resources.js";
import { seedRng, createRng } from "./rng.js";
import {
  checkBuildManor,
  checkBuildRoute,
  checkUpgrade,
  checkWritTarget,
  computeBannerHarvest,
  getPlayerBanners,
  getPlayerHoldings,
  getRenown,
  holdingAt,
  isLegalMenaceDestination,
  passesSpacing,
  totalBuildCost,
  validateBannerAssignment,
  type BuildCheck,
} from "./selectors.js";
import { Tx } from "./tx.js";
import {
  RESOURCE_TYPES,
  type BannerId,
  type GameConfig,
  type GameState,
  type HoldingId,
  type MenaceInstance,
  type PlayerId,
  type PlayerState,
  type RegionId,
  type ResourceType,
  type RulesContent,
  type SiteId,
} from "./types.js";

export interface ApplyResult {
  accepted: boolean;
  events: GameEvent[];
  error?: RuleError;
  newState?: GameState;
}

export interface RulesEngine {
  readonly ctx: RulesContext;
  createGame(config: GameConfig): GameState;
  validateCommand(state: GameState, command: GameCommand): RuleValidation;
  applyCommand(state: GameState, command: GameCommand): ApplyResult;
  /** Apply an ordered batch atomically: all accepted or none (§32.1). */
  applyBatch(state: GameState, commands: GameCommand[]): ApplyResult;
  replay(initialState: GameState, commands: GameCommand[]): GameState;
  applyDebugCommand(state: GameState, command: DebugCommand): ApplyResult;
}

export function createRulesEngine(content: RulesContent): RulesEngine {
  const ctx = createContext(content);
  const applyCommand = (state: GameState, command: GameCommand): ApplyResult => run(ctx, state, (tx) => execute(tx, command));
  return {
    ctx,
    createGame: (config) => createGame(ctx, config),
    validateCommand(state, command) {
      const r = applyCommand(state, command);
      return r.accepted ? OK : { ok: false, error: r.error ?? { code: "INVALID_COMMAND" } };
    },
    applyCommand,
    applyBatch(state, commands) {
      let cur = state;
      const events: GameEvent[] = [];
      for (const c of commands) {
        const r = applyCommand(cur, c);
        if (!r.accepted || !r.newState) return r.error ? { accepted: false, events: [], error: r.error } : { accepted: false, events: [] };
        cur = r.newState;
        events.push(...r.events);
      }
      return { accepted: true, events, newState: cur };
    },
    replay(initialState, commands) {
      let cur = initialState;
      for (const c of commands) {
        const r = applyCommand(cur, c);
        if (!r.accepted || !r.newState) throw new Error(`Replay failed at ${c.commandId} (${c.type}): ${r.error?.code} ${r.error?.detail ?? ""}`);
        cur = r.newState;
      }
      return cur;
    },
    applyDebugCommand: (state, command) => run(ctx, state, (tx) => executeDebug(tx, command)),
  };
}

function run(ctx: RulesContext, state: GameState, body: (tx: Tx) => void): ApplyResult {
  const draft = clone(state);
  const tx = new Tx(ctx, draft);
  try {
    body(tx);
  } catch (e) {
    if (e instanceof RuleViolation) {
      const error: RuleError = e.detail === undefined ? { code: e.code } : { code: e.code, detail: e.detail };
      return { accepted: false, events: [], error };
    }
    // Board lookups throw "Unknown <thing>" for ids that do not exist.
    if (e instanceof Error && e.message.startsWith("Unknown ")) return { accepted: false, events: [], error: { code: "UNKNOWN_ENTITY", detail: e.message } };
    throw e;
  }
  tx.commit();
  draft.revision += 1;
  return { accepted: true, events: tx.events, newState: draft };
}

// ------------------------------------------------------------------ creation

function newStats(): PlayerState["stats"] {
  return {
    menacesMoved: 0,
    heroesPlayed: 0,
    spellsPlayed: 0,
    resourcesHarvestedTotal: 0,
    maxSingleHarvest: 0,
    maxHarvestTypes: 0,
    menacesMovedOffOwnAssets: 0,
    writsIssued: 0,
    writsReceived: 0,
    marketTrades: 0,
    cardsBought: 0,
  };
}

function createGame(ctx: RulesContext, config: GameConfig): GameState {
  const { players, ruleset } = config;
  if (players.length < 2 || players.length > 4) throw new Error("Manors & Menaces supports 2–4 players");
  if (new Set(players.map((p) => p.id)).size !== players.length) throw new Error("Player ids must be unique");
  const rng = createRng(seedRng(config.seed));

  const first = rng.nextInt(players.length);
  const turnOrder = players.map((_, i) => (players[(first + i) % players.length] as (typeof players)[number]).id);

  const menaces: Record<string, MenaceInstance> = {};
  for (const type of ruleset.activeMenaces) {
    const start = ctx.board.topology.menaceStarts.find((m) => m.menaceType === type);
    if (!start) throw new Error(`Map has no start for ${type}`);
    const id = `menace_${type}`;
    menaces[id] = { id, type, location: clone(start.location), state: type === "young_dragon" ? { hoard: {} } : {} };
  }

  let cardDeck: string[] = [];
  if (ruleset.enableCards) {
    for (const def of ctx.content.cards) {
      if (!ruleset.enableReactionCards && isReactionOnly(def.effectId)) continue;
      for (let i = 1; i <= def.copies; i++) cardDeck.push(`${def.id}#${i}`);
    }
    cardDeck = rng.shuffle(cardDeck);
  }
  let questDeck: string[] = [];
  let revealedQuestIds: string[] = [];
  if (ruleset.enableQuests) {
    questDeck = rng.shuffle(ctx.content.quests.map((q) => q.id));
    revealedQuestIds = questDeck.splice(0, ruleset.revealedQuestCount);
  }

  const playerStates: Record<PlayerId, PlayerState> = {};
  players.forEach((p, seat) => {
    playerStates[p.id] = {
      id: p.id,
      seat,
      displayName: p.displayName,
      resources: emptyResources(),
      hand: [],
      bonusRenown: 0,
      holdingIds: [],
      routeIds: [],
      claimedQuestIds: [],
      stats: newStats(),
      marketTradesThisTurn: 0,
      nonReactionCardsPlayedThisTurn: 0,
      writsIssuedThisTurn: 0,
      wardensHiredThisTurn: 0,
      firstHarvestSkipped: false,
    };
  });

  const placementOrder = [...turnOrder, ...[...turnOrder].reverse()];
  return {
    revision: 0,
    matchId: config.matchId,
    rulesetVersion: config.rulesetVersion,
    ruleset: clone(ruleset),
    seed: config.seed,
    rngState: rng.state,
    status: "setup",
    setup: {
      placementOrder,
      placementIndex: 0,
      step: "place_manor",
      lastPlacedSiteId: null,
      bannerAssignmentOrder: [...turnOrder].reverse(),
      bannerAssignmentIndex: 0,
    },
    round: 0,
    turnNumber: 0,
    turnOrder,
    activePlayerId: placementOrder[0] as PlayerId,
    phase: "main",
    holdings: {},
    routeOwners: {},
    players: playerStates,
    banners: {},
    menaces,
    cardDeck,
    discardPile: [],
    questDeck,
    revealedQuestIds,
    activeEffects: [],
    nextIds: { holding: 1, banner: 1 },
  };
}

// ------------------------------------------------------------------ dispatch

function execute(tx: Tx, cmd: GameCommand): void {
  const s = tx.s;
  check(cmd && typeof cmd === "object" && typeof cmd.type === "string", "INVALID_COMMAND");
  check(cmd.matchId === s.matchId, "INVALID_COMMAND", "wrong match");
  check(s.players[cmd.playerId], "UNKNOWN_ENTITY", "unknown player");
  check(s.status !== "finished", "GAME_NOT_ACTIVE");

  // Pending decisions take priority over everything else.
  if (s.pending) {
    switch (cmd.type) {
      case "react":
        return react(tx, cmd.playerId, cmd.cardId);
      case "pass_reaction":
        return passReaction(tx, cmd.playerId);
      case "resolve_prophecy":
        return resolveProphecy(tx, cmd.playerId, cmd.order);
      default:
        throw new RuleViolation("PENDING_DECISION");
    }
  }

  if (s.status === "setup") {
    switch (cmd.type) {
      case "place_initial_manor":
        return placeInitialManor(tx, cmd.playerId, cmd.siteId);
      case "place_initial_route":
        return placeInitialRoute(tx, cmd.playerId, cmd.routeId);
      case "assign_initial_banners":
        return assignInitialBanners(tx, cmd.playerId, cmd.assignments);
      default:
        throw new RuleViolation("WRONG_PHASE", "game is in setup");
    }
  }

  check(cmd.playerId === s.activePlayerId, "NOT_ACTIVE_PLAYER");
  const inPhase = (phase: GameState["phase"]): void => check(s.phase === phase, "WRONG_PHASE", `expected ${phase}, is ${s.phase}`);

  switch (cmd.type) {
    case "build_route":
      inPhase("main");
      return buildRoute(tx, cmd.playerId, cmd.routeId, cmd.tollPayment);
    case "build_manor":
      inPhase("main");
      return buildManor(tx, cmd.playerId, cmd.siteId, cmd.tollPayment, cmd.extraPayment);
    case "upgrade_holding":
      inPhase("main");
      return upgradeHolding(tx, cmd.playerId, cmd.siteId, cmd.extraPayment);
    case "buy_card":
      inPhase("main");
      return buyCard(tx, cmd.playerId);
    case "play_card":
      inPhase("main");
      return playCard(tx, cmd.playerId, cmd.cardId, cmd.target);
    case "trade":
      inPhase("main");
      return trade(tx, cmd.playerId, cmd.give, cmd.receive, cmd.tradePostSiteId);
    case "issue_royal_writ":
      inPhase("main");
      return issueWrit(tx, cmd.playerId, cmd.targetBannerId, cmd.bribe);
    case "hire_warden":
      inPhase("main");
      return hireWarden(tx, cmd.playerId, cmd.menaceId, cmd.destination);
    case "claim_quest":
      inPhase("main");
      return claimQuest(tx, cmd.playerId, cmd.questId);
    case "end_main_phase":
      inPhase("main");
      s.phase = "banner_assignment";
      tx.emit({ type: "phase_changed", playerId: cmd.playerId, phase: s.phase });
      return;
    case "assign_banners":
      inPhase("banner_assignment");
      applyAssignments(tx, cmd.playerId, cmd.assignments);
      s.phase = "end";
      tx.emit({ type: "phase_changed", playerId: cmd.playerId, phase: s.phase });
      return;
    case "discard_cards":
      inPhase("end");
      return discardCards(tx, cmd.playerId, cmd.cardIds);
    case "end_turn":
      inPhase("end");
      return endTurn(tx, cmd.playerId);
    case "react":
    case "pass_reaction":
    case "resolve_prophecy":
      throw new RuleViolation("NO_PENDING_REACTION");
    case "place_initial_manor":
    case "place_initial_route":
    case "assign_initial_banners":
      throw new RuleViolation("WRONG_PHASE", "setup is over");
  }
}

// ------------------------------------------------------------------ setup (§28)

function createHolding(tx: Tx, playerId: PlayerId, siteId: SiteId): HoldingId {
  const s = tx.s;
  const id = `holding_${s.nextIds.holding++}`;
  s.holdings[id] = { id, siteId, ownerId: playerId, type: "manor" };
  tx.player(playerId).holdingIds.push(id);
  createBanner(tx, playerId, id);
  return id;
}

function createBanner(tx: Tx, playerId: PlayerId, holdingId: HoldingId): BannerId {
  const s = tx.s;
  const id = `banner_${s.nextIds.banner++}`;
  s.banners[id] = { id, ownerId: playerId, holdingId, regionId: null, settled: false };
  tx.emit({ type: "banner_created", playerId, bannerId: id, holdingId });
  return id;
}

function placeInitialManor(tx: Tx, playerId: PlayerId, siteId: SiteId): void {
  const s = tx.s;
  const setup = s.setup;
  check(setup && setup.step === "place_manor", "WRONG_PHASE");
  check(setup.placementOrder[setup.placementIndex] === playerId, "NOT_ACTIVE_PLAYER");
  check(typeof siteId === "string" && tx.ctx.board.hasSite(siteId), "UNKNOWN_ENTITY", "site");
  check(!holdingAt(s, siteId), "SITE_OCCUPIED");
  check(passesSpacing(tx.ctx, s, siteId), "SITE_TOO_CLOSE");
  const holdingId = createHolding(tx, playerId, siteId);
  tx.emit({ type: "holding_built", playerId, holdingId, siteId, free: true });
  // §28.3 starting resources after the second Manor.
  if (tx.player(playerId).holdingIds.length === BALANCE.initialManors) {
    for (const regionId of tx.ctx.board.site(siteId).adjacentRegionIds) {
      tx.gain(playerId, tx.ctx.board.region(regionId).resource, 1, "starting_resources");
    }
  }
  setup.step = "place_route";
  setup.lastPlacedSiteId = siteId;
  tx.emit({ type: "setup_step", playerId, step: "place_route" });
}

function placeInitialRoute(tx: Tx, playerId: PlayerId, routeId: string): void {
  const s = tx.s;
  const setup = s.setup;
  check(setup && setup.step === "place_route", "WRONG_PHASE");
  check(setup.placementOrder[setup.placementIndex] === playerId, "NOT_ACTIVE_PLAYER");
  check(typeof routeId === "string" && tx.ctx.board.hasRoute(routeId), "UNKNOWN_ENTITY", "route");
  check(s.routeOwners[routeId] === undefined, "ROUTE_OCCUPIED");
  const r = tx.ctx.board.route(routeId);
  check(r.siteA === setup.lastPlacedSiteId || r.siteB === setup.lastPlacedSiteId, "NOT_CONNECTED", "must touch the Manor just placed");
  s.routeOwners[routeId] = playerId;
  tx.player(playerId).routeIds.push(routeId);
  tx.emit({ type: "route_built", playerId, routeId, free: true });
  setup.placementIndex += 1;
  setup.lastPlacedSiteId = null;
  if (setup.placementIndex < setup.placementOrder.length) {
    setup.step = "place_manor";
    s.activePlayerId = setup.placementOrder[setup.placementIndex] as PlayerId;
    tx.emit({ type: "setup_step", playerId: s.activePlayerId, step: "place_manor" });
  } else {
    setup.step = "assign_banners";
    s.activePlayerId = setup.bannerAssignmentOrder[0] as PlayerId;
    tx.emit({ type: "setup_step", playerId: s.activePlayerId, step: "assign_banners" });
  }
}

function assignInitialBanners(tx: Tx, playerId: PlayerId, assignments: Record<BannerId, RegionId | null>): void {
  const s = tx.s;
  const setup = s.setup;
  check(setup && setup.step === "assign_banners", "WRONG_PHASE");
  check(setup.bannerAssignmentOrder[setup.bannerAssignmentIndex] === playerId, "NOT_ACTIVE_PLAYER");
  applyAssignments(tx, playerId, assignments);
  setup.bannerAssignmentIndex += 1;
  if (setup.bannerAssignmentIndex < setup.bannerAssignmentOrder.length) {
    s.activePlayerId = setup.bannerAssignmentOrder[setup.bannerAssignmentIndex] as PlayerId;
    tx.emit({ type: "setup_step", playerId: s.activePlayerId, step: "assign_banners" });
    return;
  }
  delete s.setup;
  s.status = "playing";
  s.round = 1;
  s.turnNumber = 1;
  s.activePlayerId = s.turnOrder[0] as PlayerId;
  tx.emit({ type: "game_started", firstPlayerId: s.activePlayerId, turnOrder: [...s.turnOrder] });
  startTurn(tx, s.activePlayerId);
}

// ------------------------------------------------------------------ banners

function applyAssignments(tx: Tx, playerId: PlayerId, assignments: Record<BannerId, RegionId | null>): void {
  check(assignments && typeof assignments === "object", "INVALID_COMMAND");
  const v = validateBannerAssignment(tx.ctx, tx.s, playerId, assignments);
  if (!v.ok) throw new RuleViolation(v.error.code, v.error.detail);
  for (const [bannerId, regionId] of Object.entries(assignments)) {
    const b = tx.s.banners[bannerId];
    if (!b || b.regionId === regionId) continue;
    const from = b.regionId;
    b.regionId = regionId;
    b.settled = false;
    tx.emit({ type: "banner_assigned", playerId, bannerId, fromRegionId: from, toRegionId: regionId });
  }
}

// ------------------------------------------------------------------ turn flow (§16)

function startTurn(tx: Tx, playerId: PlayerId): void {
  const s = tx.s;
  // Fog of Confusion lasts until the start of its caster's next turn.
  const expired = s.activeEffects.filter((e) => e.kind === "fog" && e.sourcePlayerId === playerId);
  if (expired.length) {
    s.activeEffects = s.activeEffects.filter((e) => !(e.kind === "fog" && e.sourcePlayerId === playerId));
    tx.emit({ type: "effect_expired", effect: "fog", playerId });
  }
  // A Warden's guard lasts until the start of its hirer's next turn (§26.1).
  for (const m of Object.values(s.menaces)) if (m.state.guardedBy === playerId) delete m.state.guardedBy;
  tx.emit({ type: "turn_started", playerId, turnNumber: s.turnNumber, round: s.round });
  const p = tx.player(playerId);
  s.phase = "harvest";
  if (!p.firstHarvestSkipped) {
    p.firstHarvestSkipped = true;
    tx.emit({ type: "harvest_skipped", playerId });
  } else {
    resolveHarvest(tx, playerId);
  }
  s.phase = "main";
  tx.emit({ type: "phase_changed", playerId, phase: "main" });
}

function resolveHarvest(tx: Tx, playerId: PlayerId): void {
  const s = tx.s;
  const byType: Partial<Record<ResourceType, number>> = {};
  let total = 0;
  const banners = getPlayerBanners(s, playerId).filter((b) => b.regionId);
  // Compute all outcomes against the pre-harvest state, then apply.
  const outcomes = banners.map((b) => computeBannerHarvest(tx.ctx, s, b, b.regionId as RegionId));
  for (const o of outcomes) {
    tx.emit({ type: "banner_harvested", playerId, bannerId: o.bannerId, regionId: o.regionId, produced: o.produced, amount: o.amount, notes: o.notes });
    if (o.hoard) {
      const dragon = s.menaces[o.hoard.menaceId];
      if (dragon) {
        const hoard = (dragon.state.hoard ??= {});
        hoard[o.hoard.resource] = (hoard[o.hoard.resource] ?? 0) + 1;
        tx.emit({ type: "hoard_changed", menaceId: dragon.id, resource: o.hoard.resource, delta: 1 });
      }
    }
    if (o.produced && o.amount > 0) {
      tx.gain(playerId, o.produced, o.amount, "harvest");
      byType[o.produced] = (byType[o.produced] ?? 0) + o.amount;
      total += o.amount;
    }
  }
  for (const b of banners) {
    const banner = s.banners[b.id];
    if (banner) banner.settled = true;
  }
  // Druid's Blessing applies to exactly one Harvest.
  if (s.activeEffects.some((e) => e.kind === "druids_blessing" && e.sourcePlayerId === playerId)) {
    s.activeEffects = s.activeEffects.filter((e) => !(e.kind === "druids_blessing" && e.sourcePlayerId === playerId));
    tx.emit({ type: "effect_expired", effect: "druids_blessing", playerId });
  }
  const stats = tx.player(playerId).stats;
  stats.resourcesHarvestedTotal += total;
  stats.maxSingleHarvest = Math.max(stats.maxSingleHarvest, total);
  stats.maxHarvestTypes = Math.max(stats.maxHarvestTypes, Object.keys(byType).length);
  tx.emit({ type: "harvest_completed", playerId, total, byType });
}

function endTurn(tx: Tx, playerId: PlayerId): void {
  const s = tx.s;
  const p = tx.player(playerId);
  check(p.hand.length <= s.ruleset.handLimit, "HAND_OVER_LIMIT");
  // Refill revealed Quests.
  while (s.ruleset.enableQuests && s.revealedQuestIds.length < s.ruleset.revealedQuestCount && s.questDeck.length > 0) {
    const q = s.questDeck.shift() as string;
    s.revealedQuestIds.push(q);
    tx.emit({ type: "quest_revealed", questId: q });
  }
  p.marketTradesThisTurn = 0;
  p.nonReactionCardsPlayedThisTurn = 0;
  p.writsIssuedThisTurn = 0;
  p.wardensHiredThisTurn = 0;
  tx.emit({ type: "turn_ended", playerId });

  const winner = checkVictory(tx);
  if (winner) {
    s.status = "finished";
    s.winnerId = winner;
    tx.emit({ type: "game_won", playerId: winner, renown: getRenown(tx.ctx, s, winner) });
    return;
  }
  const idx = s.turnOrder.indexOf(playerId);
  const nextIdx = (idx + 1) % s.turnOrder.length;
  if (nextIdx === 0) s.round += 1;
  s.turnNumber += 1;
  s.activePlayerId = s.turnOrder[nextIdx] as PlayerId;
  startTurn(tx, s.activePlayerId);
}

/** §7 victory check with tie-breaks. */
function checkVictory(tx: Tx): PlayerId | null {
  const s = tx.s;
  const eligible = s.turnOrder.filter((id) => getRenown(tx.ctx, s, id) >= s.ruleset.targetRenown);
  if (eligible.length === 0) return null;
  const strongholds = (id: PlayerId): number => getPlayerHoldings(s, id).filter((h) => h.type === "stronghold").length;
  const key = (id: PlayerId): number[] => {
    const p = s.players[id] as PlayerState;
    return [getRenown(tx.ctx, s, id), p.claimedQuestIds.length, strongholds(id), totalResources(p.resources), -s.turnOrder.indexOf(id)];
  };
  return [...eligible].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return (kb[i] as number) - (ka[i] as number);
    return 0;
  })[0] as PlayerId;
}

// ------------------------------------------------------------------ building

function payForBuild(tx: Tx, playerId: PlayerId, check_: BuildCheck, toll: unknown, surcharge: unknown, reason: "build_route" | "build_manor" | "upgrade_holding"): void {
  if (!check_.legal) throw new RuleViolation(check_.reason);
  if (check_.needsToll) check(isResourceType(toll), "INVALID_PAYMENT", "toll required (Highwayman)");
  else check(toll === undefined, "INVALID_PAYMENT", "no toll is due");
  if (check_.needsSurcharge) check(isResourceType(surcharge), "INVALID_PAYMENT", "Goblin Tinkers surcharge required");
  else check(surcharge === undefined, "INVALID_PAYMENT", "no surcharge is due");
  const t = check_.needsToll ? (toll as ResourceType) : undefined;
  const g = check_.needsSurcharge ? (surcharge as ResourceType) : undefined;
  const p = tx.player(playerId);
  const total = totalBuildCost(check_, t, g);
  for (const r of RESOURCE_TYPES) check(p.resources[r] >= (total[r] ?? 0), "INSUFFICIENT_RESOURCES", r);
  tx.spend(playerId, check_.cost, reason);
  if (t) tx.spend(playerId, { [t]: BALANCE.costs.toll }, "toll");
  if (g) tx.spend(playerId, { [g]: BALANCE.costs.goblinSurcharge }, "goblin_tinkers");
}

function buildRoute(tx: Tx, playerId: PlayerId, routeId: string, toll: unknown): void {
  check(typeof routeId === "string", "INVALID_COMMAND");
  const c = checkBuildRoute(tx.ctx, tx.s, playerId, routeId);
  payForBuild(tx, playerId, c, toll, undefined, "build_route");
  tx.s.routeOwners[routeId] = playerId;
  tx.player(playerId).routeIds.push(routeId);
  tx.emit({ type: "route_built", playerId, routeId, free: false });
}

function buildManor(tx: Tx, playerId: PlayerId, siteId: string, toll: unknown, surcharge: unknown): void {
  check(typeof siteId === "string", "INVALID_COMMAND");
  const c = checkBuildManor(tx.ctx, tx.s, playerId, siteId);
  payForBuild(tx, playerId, c, toll, surcharge, "build_manor");
  const holdingId = createHolding(tx, playerId, siteId);
  tx.emit({ type: "holding_built", playerId, holdingId, siteId, free: false });
}

function upgradeHolding(tx: Tx, playerId: PlayerId, siteId: string, surcharge: unknown): void {
  check(typeof siteId === "string", "INVALID_COMMAND");
  const c = checkUpgrade(tx.s, playerId, siteId);
  payForBuild(tx, playerId, c, undefined, surcharge, "upgrade_holding");
  const h = holdingAt(tx.s, siteId);
  check(h, "UNKNOWN_ENTITY");
  h.type = "stronghold";
  // §114: the existing Banner stays; a second Banner gets a new stable id.
  const newBannerId = createBanner(tx, playerId, h.id);
  tx.emit({ type: "holding_upgraded", playerId, holdingId: h.id, siteId, newBannerId });
}

// ------------------------------------------------------------------ market (§17)

function trade(tx: Tx, playerId: PlayerId, give: unknown, receive: unknown, postSiteId: unknown): void {
  const s = tx.s;
  const p = tx.player(playerId);
  check(isResourceType(give) && isResourceType(receive) && give !== receive, "INVALID_TRADE");
  check(p.marketTradesThisTurn < s.ruleset.market.maxTradesPerTurn, "MARKET_LIMIT_REACHED");
  let giveAmount: number = s.ruleset.market.give;
  let siteId: SiteId | null = null;
  if (postSiteId !== undefined) {
    check(s.ruleset.enableTradePosts, "FEATURE_DISABLED", "trade posts");
    check(typeof postSiteId === "string" && tx.ctx.board.hasSite(postSiteId), "NO_TRADE_POST");
    const post = tx.ctx.board.site(postSiteId).tradePost;
    check(post && holdingAt(s, postSiteId)?.ownerId === playerId, "NO_TRADE_POST");
    check(post.resource === give, "INVALID_TRADE", "this post trades only " + post.resource);
    giveAmount = post.give;
    siteId = postSiteId;
  }
  tx.spend(playerId, { [give]: giveAmount }, "market");
  tx.gain(playerId, receive, s.ruleset.market.receive, "market");
  p.marketTradesThisTurn += 1;
  p.stats.marketTrades += 1;
  tx.emit({ type: "market_traded", playerId, give, giveAmount, receive, tradePostSiteId: siteId });
}

// ------------------------------------------------------------------ Royal Writ / Warden

function issueWrit(tx: Tx, playerId: PlayerId, bannerId: string, bribe: unknown): void {
  const s = tx.s;
  check(s.ruleset.writ.enabled, "FEATURE_DISABLED", "royal writ");
  const p = tx.player(playerId);
  check(p.writsIssuedThisTurn < s.ruleset.writ.maxPerTurn, "WRIT_LIMIT_REACHED");
  check(isResourceType(bribe), "INVALID_PAYMENT", "bribe must be a resource");
  const v = checkWritTarget(tx.ctx, s, playerId, bannerId);
  if (!v.ok) throw new RuleViolation(v.error.code, v.error.detail);
  const banner = s.banners[bannerId];
  check(banner && banner.regionId, "UNKNOWN_ENTITY");
  const need: Partial<Record<ResourceType, number>> = { ...BALANCE.costs.royalWrit };
  need[bribe] = (need[bribe] ?? 0) + BALANCE.costs.royalWritBribe;
  for (const r of RESOURCE_TYPES) check(p.resources[r] >= (need[r] ?? 0), "INSUFFICIENT_RESOURCES", r);
  tx.spend(playerId, BALANCE.costs.royalWrit, "royal_writ");
  if (s.ruleset.writ.bribeToOwner) tx.transfer(playerId, banner.ownerId, bribe, BALANCE.costs.royalWritBribe, "royal_writ");
  else tx.spend(playerId, { [bribe]: BALANCE.costs.royalWritBribe }, "royal_writ");
  const from = banner.regionId;
  banner.regionId = null;
  banner.settled = false;
  p.writsIssuedThisTurn += 1;
  p.stats.writsIssued += 1;
  tx.player(banner.ownerId).stats.writsReceived += 1;
  tx.emit({ type: "royal_writ_issued", playerId, targetBannerId: bannerId, ownerId: banner.ownerId });
  tx.emit({ type: "banner_displaced", byPlayerId: playerId, ownerId: banner.ownerId, bannerId, fromRegionId: from, toRegionId: null, cause: "royal_writ" });
}

function hireWarden(tx: Tx, playerId: PlayerId, menaceId: string, destination: unknown): void {
  const s = tx.s;
  check(s.ruleset.warden.enabled, "FEATURE_DISABLED", "warden");
  const p = tx.player(playerId);
  check(p.wardensHiredThisTurn < s.ruleset.warden.maxPerTurn, "WARDEN_LIMIT_REACHED");
  const m = s.menaces[menaceId];
  check(m, "UNKNOWN_ENTITY", "menace");
  check(!(s.ruleset.warden.guard && m.state.guardedBy && m.state.guardedBy !== playerId), "MENACE_GUARDED");
  check(destination && typeof destination === "object", "ILLEGAL_MENACE_TARGET");
  const dest = destination as MenaceInstance["location"];
  check(isLegalMenaceDestination(tx.ctx, s, menaceId, dest), "ILLEGAL_MENACE_TARGET");
  tx.spend(playerId, BALANCE.costs.warden, "warden");
  p.wardensHiredThisTurn += 1;
  tx.emit({ type: "warden_hired", playerId, menaceId });
  tx.moveMenace(playerId, m, clone(dest));
  if (s.ruleset.warden.guard) m.state.guardedBy = playerId;
}

// ------------------------------------------------------------------ cards (§18)

function buyCard(tx: Tx, playerId: PlayerId): void {
  const s = tx.s;
  check(s.ruleset.enableCards, "FEATURE_DISABLED", "cards");
  check(s.cardDeck.length + s.discardPile.length > 0, "DECK_EMPTY");
  tx.spend(playerId, BALANCE.costs.card, "buy_card");
  const card = tx.drawCard();
  check(card, "DECK_EMPTY");
  const p = tx.player(playerId);
  p.hand.push(card);
  p.stats.cardsBought += 1;
  tx.emit({ type: "card_bought", playerId, cardId: card });
}

function playCard(tx: Tx, playerId: PlayerId, cardId: string, target: import("./types.js").CardTarget): void {
  const s = tx.s;
  check(s.ruleset.enableCards, "FEATURE_DISABLED", "cards");
  const p = tx.player(playerId);
  check(p.hand.includes(cardId), "CARD_NOT_IN_HAND");
  const def = tx.ctx.cardOf(cardId);
  check(def.timing.includes("main"), "INVALID_CARD_TARGET", "not playable in the Main phase");
  check(p.nonReactionCardsPlayedThisTurn < s.ruleset.maxNonReactionCardsPerTurn, "CARD_LIMIT_REACHED");
  validateCardTarget(tx.ctx, s, playerId, cardId, target);
  p.hand = p.hand.filter((c) => c !== cardId);
  p.nonReactionCardsPlayedThisTurn += 1;
  if (def.type === "hero") p.stats.heroesPlayed += 1;
  if (def.type === "spell") p.stats.spellsPlayed += 1;
  tx.emit({ type: "card_played", playerId, cardId });

  // §109 reaction window: opponents holding a reaction card may respond to a Spell.
  if (def.type === "spell" && s.ruleset.enableReactionCards) {
    const eligible = reactionHolders(tx, playerId);
    if (eligible.length > 0) {
      s.pending = { kind: "reaction", cardId, sourcePlayerId: playerId, target: clone(target), eligiblePlayerIds: eligible };
      tx.emit({ type: "reaction_requested", playerId: eligible[0] as PlayerId, cardId });
      return;
    }
  }
  resolveCard(tx, playerId, cardId, target);
}

function reactionHolders(tx: Tx, sourcePlayerId: PlayerId): PlayerId[] {
  const s = tx.s;
  const start = s.turnOrder.indexOf(sourcePlayerId);
  const ordered = s.turnOrder.map((_, i) => s.turnOrder[(start + 1 + i) % s.turnOrder.length] as PlayerId).filter((id) => id !== sourcePlayerId);
  return ordered.filter((id) => (s.players[id]?.hand ?? []).some((c) => tx.ctx.cardOf(c).timing.includes("reaction")));
}

function resolveCard(tx: Tx, playerId: PlayerId, cardId: string, target: import("./types.js").CardTarget): void {
  resolveCardEffect(tx, playerId, target);
  tx.discard(cardId);
  tx.emit({ type: "card_resolved", playerId, cardId });
}

function react(tx: Tx, playerId: PlayerId, cardId: string): void {
  const s = tx.s;
  const pending = s.pending;
  check(pending && pending.kind === "reaction", "NO_PENDING_REACTION");
  check(pending.eligiblePlayerIds[0] === playerId, "NOT_ACTIVE_PLAYER", "not your reaction");
  const p = tx.player(playerId);
  check(p.hand.includes(cardId), "CARD_NOT_IN_HAND");
  const def = tx.ctx.cardOf(cardId);
  check(def.timing.includes("reaction") && def.effectId === "counterspell", "INVALID_CARD_TARGET");
  p.hand = p.hand.filter((c) => c !== cardId);
  if (def.type === "spell") p.stats.spellsPlayed += 1;
  tx.emit({ type: "card_played", playerId, cardId });
  // Counterspell cancels the Spell; it cannot itself be countered.
  tx.discard(pending.cardId);
  tx.discard(cardId);
  tx.emit({ type: "card_cancelled", playerId: pending.sourcePlayerId, cardId: pending.cardId, byPlayerId: playerId, counterCardId: cardId });
  delete s.pending;
}

function passReaction(tx: Tx, playerId: PlayerId): void {
  const s = tx.s;
  const pending = s.pending;
  check(pending && pending.kind === "reaction", "NO_PENDING_REACTION");
  check(pending.eligiblePlayerIds[0] === playerId, "NOT_ACTIVE_PLAYER", "not your reaction");
  pending.eligiblePlayerIds.shift();
  tx.emit({ type: "reaction_passed", playerId });
  if (pending.eligiblePlayerIds.length > 0) {
    tx.emit({ type: "reaction_requested", playerId: pending.eligiblePlayerIds[0] as PlayerId, cardId: pending.cardId });
    return;
  }
  delete s.pending;
  resolveCard(tx, pending.sourcePlayerId, pending.cardId, pending.target);
}

function resolveProphecy(tx: Tx, playerId: PlayerId, order: unknown): void {
  const s = tx.s;
  const pending = s.pending;
  check(pending && pending.kind === "prophecy", "NO_PENDING_REACTION");
  check(pending.playerId === playerId, "NOT_ACTIVE_PLAYER");
  check(Array.isArray(order), "INVALID_COMMAND");
  const want = [...pending.cardIds].sort();
  const got = [...(order as string[])].sort();
  check(want.length === got.length && want.every((c, i) => c === got[i]), "INVALID_CARD_TARGET", "order must be a permutation");
  // The revealed cards are on top of the deck; replace them in the new order.
  check(pending.cardIds.every((c, i) => s.cardDeck[i] === c), "INVALID_COMMAND", "deck changed");
  s.cardDeck.splice(0, pending.cardIds.length, ...(order as string[]));
  delete s.pending;
  tx.emit({ type: "prophecy_resolved", playerId });
}

function discardCards(tx: Tx, playerId: PlayerId, cardIds: unknown): void {
  check(Array.isArray(cardIds) && cardIds.length > 0, "INVALID_COMMAND");
  const p = tx.player(playerId);
  const ids = cardIds as string[];
  check(new Set(ids).size === ids.length && ids.every((c) => p.hand.includes(c)), "CARD_NOT_IN_HAND");
  p.hand = p.hand.filter((c) => !ids.includes(c));
  for (const c of ids) {
    tx.discard(c);
    tx.emit({ type: "card_discarded", playerId, cardId: c });
  }
}

// ------------------------------------------------------------------ quests (§27)

function claimQuest(tx: Tx, playerId: PlayerId, questId: string): void {
  const s = tx.s;
  check(s.ruleset.enableQuests, "FEATURE_DISABLED", "quests");
  check(s.revealedQuestIds.includes(questId), "QUEST_NOT_AVAILABLE");
  check(getQuestProgress(tx.ctx, s, playerId, questId).complete, "QUEST_NOT_COMPLETE");
  s.revealedQuestIds = s.revealedQuestIds.filter((q) => q !== questId);
  tx.player(playerId).claimedQuestIds.push(questId);
  tx.emit({ type: "quest_claimed", playerId, questId, renown: tx.ctx.quest(questId).renown });
}

// ------------------------------------------------------------------ debug (§100)

function executeDebug(tx: Tx, cmd: DebugCommand): void {
  const s = tx.s;
  switch (cmd.type) {
    case "debug_grant":
      for (const [r, n] of Object.entries(cmd.resources)) if (isResourceType(r) && n) tx.gain(cmd.targetPlayerId, r, n, "debug");
      return;
    case "debug_set_bonus_renown":
      tx.player(cmd.targetPlayerId).bonusRenown = cmd.value;
      return;
    case "debug_move_menace": {
      const m = s.menaces[cmd.menaceId];
      check(m && isLegalMenaceDestination(tx.ctx, s, cmd.menaceId, cmd.destination), "ILLEGAL_MENACE_TARGET");
      tx.moveMenace(null, m, cmd.destination);
      return;
    }
    case "debug_draw_card": {
      const idx = s.cardDeck.findIndex((c) => c.startsWith(`${cmd.cardDefId}#`));
      check(idx >= 0, "DECK_EMPTY");
      const [card] = s.cardDeck.splice(idx, 1);
      tx.player(cmd.targetPlayerId).hand.push(card as string);
      return;
    }
  }
}

export { createGame as createGameState };
