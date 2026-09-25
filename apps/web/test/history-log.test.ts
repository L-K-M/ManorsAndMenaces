import { describe, expect, it } from "vitest";
import type { HistoryEntry } from "@manors-menaces/protocol";
import { mvpRuleset, type GameState } from "@manors-menaces/rules";
import { mapFor } from "../src/lib/game/engine.js";
import { formatEvents, historyLog } from "../src/lib/game/log.js";
import { engine, playGame } from "./helpers.js";

// An online match's Chronicle comes from the server's history when it is
// (re)opened; the moves made since this device last showed it come after a
// "since your last visit" divider.
describe("historyLog", () => {
  const map = mapFor("greenvale");
  const game = playGame(mvpRuleset(), "history-log", 2, 120);
  const entries: HistoryEntry[] = [];
  let state: GameState = game.initial;
  for (const command of game.commands) {
    const r = engine.applyCommand(state, command);
    state = r.newState as GameState;
    entries.push({ revision: state.revision, events: r.events });
  }
  const texts = (lines: { text: string }[]) => lines.map((l) => l.text);
  const linesOf = (from: HistoryEntry[]) => texts(from.flatMap((e) => formatEvents(e.events, state, map)));

  it("has every move and no divider on a first visit", () => {
    const log = historyLog(entries, true, null, state, map);
    expect(log.some((e) => e.kind === "divider")).toBe(false);
    expect(texts(log)).toEqual(linesOf(entries));
  });

  it("puts the moves made since the last visit after a divider", () => {
    const lastSeen = entries[60]!.revision;
    const log = historyLog(entries, true, lastSeen, state, map);
    const at = log.findIndex((e) => e.kind === "divider");
    expect(log.filter((e) => e.kind === "divider")).toHaveLength(1);
    expect(log[at]?.text).toMatch(/since your last visit/i);
    expect(texts(log.slice(0, at))).toEqual(linesOf(entries.filter((e) => e.revision <= lastSeen)));
    expect(texts(log.slice(at + 1))).toEqual(linesOf(entries.filter((e) => e.revision > lastSeen)));
  });

  it("has no divider when nothing happened since the last visit", () => {
    expect(historyLog(entries, true, state.revision, state, map).some((e) => e.kind === "divider")).toBe(false);
  });

  it("says so when the server could not replay the whole history", () => {
    const log = historyLog(entries.slice(0, 30), false, null, state, map);
    expect(log.at(-1)?.text).toMatch(/could not be loaded/);
  });
});
