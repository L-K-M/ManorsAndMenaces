// Rival quips: which moments a named AI rival comments on, and which line it
// says. Pure and deterministic so tests and replays see the same remarks.
//
// Pacing: a batch of events yields at most one quip, and each rival speaks
// at most once per turn. The end of the game is the exception: every rival
// may answer it. Lines come from a UI-only PRNG seeded per moment (match,
// revision, rival, trigger), never from the match RNG, so the rules state is
// untouched and the same history always produces the same quips.

import { rivalQuipKeys, type RivalQuipTrigger } from "@manors-menaces/content";
import { createRng, getRenown, holdingAt, seedRng, type GameEvent, type GameState, type MenaceLocation, type PlayerId, type RulesContext } from "@manors-menaces/rules";

export interface QuipCandidate {
  playerId: PlayerId;
  rivalId: string;
  trigger: RivalQuipTrigger;
  /** Probability in [0, 1] that the rival speaks up. */
  chance: number;
}

export interface Quip {
  playerId: PlayerId;
  rivalId: string;
  trigger: RivalQuipTrigger;
  /** i18n key of the chosen line. */
  key: string;
}

/** Higher first: a rival with several things to say picks the weightiest. */
const PRIORITY: readonly RivalQuipTrigger[] = ["win", "lose", "writ", "lead", "menace_hit", "near_you", "own_build"];

/** How talkative each moment is; routine building stays mostly quiet. */
export const QUIP_CHANCE: Readonly<Record<RivalQuipTrigger, number>> = {
  own_build: 0.35,
  near_you: 0.6,
  writ: 1,
  menace_hit: 0.4,
  lead: 1,
  win: 1,
  lose: 1,
};

const ENDGAME: ReadonlySet<RivalQuipTrigger> = new Set(["win", "lose"]);

export interface QuipScene {
  ctx: RulesContext;
  /** State before and after the batch of events. */
  before: GameState;
  after: GameState;
  events: readonly GameEvent[];
  /** Rival id of each AI seat that has one. */
  rivals: Readonly<Record<PlayerId, string>>;
  isHuman(playerId: PlayerId): boolean;
}

/** Every moment in a batch a rival might comment on. */
export function detectQuipCandidates(scene: QuipScene): QuipCandidate[] {
  const { ctx, before, after, events, rivals, isHuman } = scene;
  const found = new Map<string, QuipCandidate>();
  const add = (playerId: PlayerId, trigger: RivalQuipTrigger, chance = QUIP_CHANCE[trigger]) => {
    const rivalId = rivals[playerId];
    if (!rivalId) return;
    const k = `${playerId}:${trigger}`;
    const prev = found.get(k);
    if (!prev || prev.chance < chance) found.set(k, { playerId, rivalId, trigger, chance });
  };

  for (const e of events) {
    switch (e.type) {
      case "holding_built":
        if (rivals[e.playerId]) {
          // A rival's very first Manor always gets a line: it introduces them.
          // Judged on the state before the batch, which may hold two builds.
          const first = (before.players[e.playerId]?.holdingIds.length ?? 0) === 0;
          add(e.playerId, "own_build", first ? 1 : QUIP_CHANCE.own_build);
        } else if (isHuman(e.playerId) && !e.free) {
          for (const rivalPid of Object.keys(rivals)) if (sharesRegionWith(ctx, after, e.siteId, rivalPid)) add(rivalPid, "near_you");
        }
        break;
      case "holding_upgraded":
        add(e.playerId, "own_build", 0.6);
        break;
      case "banner_displaced":
        if (e.cause === "royal_writ" && isHuman(e.ownerId)) add(e.byPlayerId, "writ");
        break;
      case "menace_moved":
        for (const rivalPid of Object.keys(rivals)) if (rivalPid !== e.byPlayerId && menaceHits(after, e.to, rivalPid)) add(rivalPid, "menace_hit");
        break;
      case "game_won":
        for (const rivalPid of Object.keys(rivals)) add(rivalPid, rivalPid === e.playerId ? "win" : "lose");
        break;
      default:
        break;
    }
  }

  if (after.status === "playing") {
    // A lead is news once it is worth a third of the target (early leads
    // flip constantly) and when it is new: overtaking from behind, or
    // crossing that mark. Pulling ahead of a tie at the top is not.
    const threshold = Math.ceil(after.ruleset.targetRenown / 3);
    const now = topOfTable(ctx, after);
    const leader = now.leaders.length === 1 ? now.leaders[0] : undefined;
    if (leader && now.renown >= threshold && (!topOfTable(ctx, before).leaders.includes(leader) || getRenown(ctx, before, leader) < threshold)) add(leader, "lead");
  }

  return [...found.values()];
}

function sharesRegionWith(ctx: RulesContext, state: GameState, siteId: string, playerId: PlayerId): boolean {
  const regions = new Set(ctx.board.site(siteId).adjacentRegionIds);
  return Object.values(state.holdings).some((h) => h.ownerId === playerId && ctx.board.site(h.siteId).adjacentRegionIds.some((r) => regions.has(r)));
}

function menaceHits(state: GameState, to: MenaceLocation, playerId: PlayerId): boolean {
  switch (to.kind) {
    case "region":
      return Object.values(state.banners).some((b) => b.ownerId === playerId && b.regionId === to.regionId);
    case "route":
      return state.routeOwners[to.routeId] === playerId;
    case "site":
      return holdingAt(state, to.siteId)?.ownerId === playerId;
  }
}

function topOfTable(ctx: RulesContext, state: GameState): { renown: number; leaders: PlayerId[] } {
  let top = { renown: -Infinity, leaders: [] as PlayerId[] };
  for (const pid of state.turnOrder) {
    const renown = getRenown(ctx, state, pid);
    if (renown > top.renown) top = { renown, leaders: [pid] };
    else if (renown === top.renown) top.leaders.push(pid);
  }
  return top;
}

/**
 * Chooses which candidates become quips, applying the pacing rules. Keeps
 * per-match memory (who spoke this turn, the last line of each kind) so a
 * rival does not repeat itself back to back.
 */
export class QuipDirector {
  private readonly spokeInTurn = new Map<PlayerId, string>();
  private readonly lastLine = new Map<string, number>();

  constructor(private readonly matchId: string) {}

  /**
   * @param turnKey identifies the turn the events happened in.
   * @param revision the state revision after the events, for seeding.
   */
  choose(candidates: readonly QuipCandidate[], turnKey: string, revision: number): Quip[] {
    const ordered = [...candidates].sort((a, b) => PRIORITY.indexOf(a.trigger) - PRIORITY.indexOf(b.trigger));
    const endgame = ordered.some((c) => ENDGAME.has(c.trigger));
    const out: Quip[] = [];
    for (const c of ordered) {
      if (!endgame && out.length > 0) break;
      if (endgame && !ENDGAME.has(c.trigger)) continue;
      if (out.some((q) => q.playerId === c.playerId)) continue;
      if (!endgame && this.spokeInTurn.get(c.playerId) === turnKey) continue;
      const keys = rivalQuipKeys(c.rivalId, c.trigger);
      if (keys.length === 0) continue;
      const rng = createRng(seedRng(`${this.matchId}:quip:${revision}:${c.playerId}:${c.trigger}`));
      if (rng.nextFloat() >= c.chance) continue;
      const lineId = `${c.rivalId}:${c.trigger}`;
      let index = rng.nextInt(keys.length);
      if (keys.length > 1 && index === this.lastLine.get(lineId)) index = (index + 1) % keys.length;
      this.lastLine.set(lineId, index);
      this.spokeInTurn.set(c.playerId, turnKey);
      out.push({ playerId: c.playerId, rivalId: c.rivalId, trigger: c.trigger, key: keys[index] as string });
    }
    return out;
  }
}

/** The turn a batch of events belongs to (setup placements count as turns). */
export function turnKeyOf(state: GameState): string {
  return `${state.turnNumber}:${state.activePlayerId}`;
}
