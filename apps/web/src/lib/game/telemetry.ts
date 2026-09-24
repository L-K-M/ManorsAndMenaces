// Local balance telemetry (spec §67). Stores an anonymous summary of each
// finished local game in this browser only — no names or identifiers
// (spec: no personally identifying data). Exported from the debug panel.

import { getPlayerHoldings, getRenown, type GameState, type RulesContext } from "@manors-menaces/rules";

const KEY = "mm.telemetry.v1";

export interface GameSummary {
  finishedAt: string;
  ruleset: string;
  playerCount: number;
  rounds: number;
  winnerSeat: number | null;
  firstPlayerWon: boolean;
  seats: {
    kind: "human" | "ai";
    renown: number;
    holdings: number;
    strongholds: number;
    quests: number;
    harvested: number;
    menacesMoved: number;
    writsIssued: number;
    writsReceived: number;
    marketTrades: number;
    cardsBought: number;
  }[];
}

export function recordGame(ctx: RulesContext, state: GameState, kinds: Record<string, "human" | "ai">): void {
  const summary: GameSummary = {
    finishedAt: new Date().toISOString(),
    ruleset: state.ruleset.name,
    playerCount: state.turnOrder.length,
    rounds: state.round,
    winnerSeat: state.winnerId ? state.turnOrder.indexOf(state.winnerId) : null,
    firstPlayerWon: state.winnerId === state.turnOrder[0],
    seats: state.turnOrder.map((id) => {
      const p = state.players[id];
      const holdings = getPlayerHoldings(state, id);
      return {
        kind: kinds[id] ?? "human",
        renown: getRenown(ctx, state, id),
        holdings: holdings.length,
        strongholds: holdings.filter((h) => h.type === "stronghold").length,
        quests: p?.claimedQuestIds.length ?? 0,
        harvested: p?.stats.resourcesHarvestedTotal ?? 0,
        menacesMoved: p?.stats.menacesMoved ?? 0,
        writsIssued: p?.stats.writsIssued ?? 0,
        writsReceived: p?.stats.writsReceived ?? 0,
        marketTrades: p?.stats.marketTrades ?? 0,
        cardsBought: p?.stats.cardsBought ?? 0,
      };
    }),
  };
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]") as GameSummary[];
    list.push(summary);
    localStorage.setItem(KEY, JSON.stringify(list.slice(-100)));
  } catch {
    // Best-effort only.
  }
}

export function loadTelemetry(): GameSummary[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as GameSummary[];
  } catch {
    return [];
  }
}
