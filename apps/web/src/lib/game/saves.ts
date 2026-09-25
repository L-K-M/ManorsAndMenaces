// Save slots and save descriptions (spec §62, §75). Pure functions only: the
// platform adapter stores saves, GameSession decides when to write them.
//
// Slots:
//   autosave:<matchId>:<n>    one per line of play, rewritten as it is played;
//                             at most MAX_AUTOSAVES are kept, oldest pruned
//   save:<matchId>:r<rev>:<h> a manual save; <h> hashes the position, so
//                             saving the same position twice rewrites one row
//                             while any different position gets its own
//   autosave                  the single shared slot of older builds, still
//                             listed and resumable (and pruned) as an autosave
//
// A new game gets a fresh autosave slot (<n> is a per-game nonce: custom seeds
// repeat, so the match id alone is not unique). Continuing an autosave keeps
// writing its slot. Opening a manual save or an imported file starts a new
// slot, so playing on from an older position never overwrites the newer
// progress of the line it came from.

import { isSaveFile, type SaveFile } from "@manors-menaces/protocol";
import { UNDO_SAFE_COMMANDS, hashState, type GameCommand, type GameEvent, type GameState, type RulesEngine } from "@manors-menaces/rules";
import { t } from "../i18n.js";
import type { SaveSummary } from "../platform/adapter.js";

export const LEGACY_AUTOSAVE_ID = "autosave";
const AUTOSAVE_PREFIX = "autosave:";
const MANUAL_PREFIX = "save:";
/** Autosaves kept on this device; enough for several games in parallel. */
export const MAX_AUTOSAVES = 10;
/** The tutorial always uses this seed; its games are never autosaved. */
export const TUTORIAL_SEED = "tutorial-1";

/** The part of a stored save that slot bookkeeping needs. */
export interface SlotRef {
  id: string;
  savedAt: string;
}

/** A fresh autosave slot for a new line of play of `matchId`. */
export function newAutosaveId(matchId: string, nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`): string {
  return `${AUTOSAVE_PREFIX}${matchId}:${nonce}`;
}

export function isAutosave(id: string): boolean {
  return id === LEGACY_AUTOSAVE_ID || id.startsWith(AUTOSAVE_PREFIX);
}

/**
 * Manual save id. It is derived from the position (committed state plus this
 * turn's undoable actions), so repeated saves of one position share a row
 * while any different position, even at the same revision, gets its own.
 */
export function manualSaveId(save: SaveFile): string {
  const position = hashState({ state: save.state, pending: save.pendingCommands ?? [] });
  return `${MANUAL_PREFIX}${save.state.matchId}:r${save.state.revision}:${position}`;
}

function newestFirst<T extends SlotRef>(slots: readonly T[]): T[] {
  return [...slots].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/** The autosave that Continue resumes: the most recently written one. */
export function latestAutosave<T extends SlotRef>(slots: readonly T[]): T | undefined {
  return newestFirst(slots.filter((s) => isAutosave(s.id)))[0];
}

/**
 * Ids of the autosaves to delete so that at most `keep` remain. `active` is
 * the slot this game writes: it is always kept (its timestamp alone cannot
 * protect it, e.g. after a clock change) and counts towards `keep`.
 */
export function autosavesToPrune(slots: readonly SlotRef[], active: string, keep = MAX_AUTOSAVES): string[] {
  return newestFirst(slots.filter((s) => isAutosave(s.id) && s.id !== active))
    .slice(keep - 1)
    .map((s) => s.id);
}

export function isTutorialSave(save: SaveFile): boolean {
  return save.initialState.seed === TUTORIAL_SEED;
}

// ------------------------------------------------------------------ descriptions

export interface SaveMeta {
  /** In turn order, with the seat colour index (spec §49). */
  players: { name: string; color: number }[];
  /** The round shown in game: setup counts as round 1. */
  round: number;
  rulesetName: string;
  status: GameState["status"];
  winner: string | null;
}

/** A listed save with its description, or `meta: null` if it cannot be read. */
export interface SaveEntry {
  id: string;
  savedAt: string;
  label: string;
  meta: SaveMeta | null;
}

/**
 * Describe stored saves for the Load list. Stored data is untrusted (older
 * builds, other tabs, manual edits): an unreadable row is kept and marked
 * rather than hiding every other save.
 */
export function describeSaves(rows: readonly SaveSummary[]): SaveEntry[] {
  return rows.map(({ id, savedAt, label, data }) => {
    let meta: SaveMeta | null = null;
    try {
      if (isSaveFile(data)) meta = describeSave(data);
    } catch {
      // Well-formed at the top level but not inside: reported as unreadable.
    }
    return { id, savedAt, label, meta };
  });
}

export function describeSave(save: SaveFile): SaveMeta {
  const { state, seats } = save;
  const seatOf = (id: string) => seats.find((s) => s.playerId === id);
  return {
    players: state.turnOrder.map((id) => ({
      name: state.players[id]?.displayName ?? seatOf(id)?.displayName ?? id,
      color: seatOf(id)?.color ?? 0,
    })),
    round: Math.max(1, state.round),
    rulesetName: state.ruleset.name,
    status: state.status,
    winner: state.winnerId ? (state.players[state.winnerId]?.displayName ?? null) : null,
  };
}

export function rulesetLabel(name: string): string {
  if (name === "mvp") return t("ui.core");
  if (name === "standard") return t("ui.standard");
  return name;
}

function playerNames(meta: SaveMeta): string {
  return meta.players.map((p) => p.name).join(t("ui.players_joiner"));
}

export function saveLabel(meta: SaveMeta): string {
  return t("ui.save_label", { players: playerNames(meta), round: meta.round });
}

/** A file name that sorts by game and round, e.g. `manors-local-abc-r4.json`. */
export function exportFileName(save: SaveFile): string {
  const match = save.state.matchId.replace(/[^\w-]+/g, "-");
  return `manors-${match}-r${Math.max(1, save.state.round)}.json`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function relativeTime(savedAt: string, now: number): string {
  const then = Date.parse(savedAt);
  const age = now - then;
  if (!Number.isFinite(age)) return "";
  if (age < MINUTE) return t("ui.time_just_now");
  if (age < HOUR) return t("ui.time_minutes_ago", { n: Math.floor(age / MINUTE) });
  if (age < DAY) return t("ui.time_hours_ago", { n: Math.floor(age / HOUR) });
  if (age < 2 * DAY) return t("ui.time_one_day_ago");
  if (age < 7 * DAY) return t("ui.time_days_ago", { n: Math.floor(age / DAY) });
  return new Date(then).toLocaleDateString();
}

// ------------------------------------------------------------------ restoring a turn in progress

export interface ReplayedStep {
  command: GameCommand;
  /** State before the command: what Undo returns to. */
  before: GameState;
  after: GameState;
  events: GameEvent[];
}

/**
 * Re-apply a save's pending (undoable, uncommitted) commands on top of its
 * committed state. Only undo-safe commands can be pending (§32.1), and save
 * files are untrusted input, so replay stops at the first command that is not
 * undo-safe or that the engine rejects: the save then opens at its last
 * valid position.
 */
export function replayPending(engine: RulesEngine, state: GameState, pending: readonly GameCommand[]): ReplayedStep[] {
  const steps: ReplayedStep[] = [];
  let current = state;
  for (const command of pending) {
    if (!UNDO_SAFE_COMMANDS.has(command.type)) break;
    const r = engine.applyCommand(current, command);
    if (!r.accepted || !r.newState) break;
    steps.push({ command, before: current, after: r.newState, events: r.events });
    current = r.newState;
  }
  return steps;
}
