// Shared client/server protocol types (spec §104) and save-file schema (§63).

import type { GameCommand, GameEvent, GameState, PlayerId, RuleError, RulesetConfig } from "@manors-menaces/rules";

// ------------------------------------------------------------------ seats

export type AiLevel = "easy" | "normal" | "hard";

export interface SeatConfig {
  playerId: PlayerId;
  displayName: string;
  kind: "human" | "ai";
  aiLevel?: AiLevel;
  /**
   * Named rival persona of an AI seat (content `RIVALS` id). Flavour only;
   * optional so older saves and online seats without it stay valid.
   */
  rivalId?: string;
  /** Heraldic colour index (0–3). */
  color: number;
}

// ------------------------------------------------------------------ saves (§63)

export const SAVE_SCHEMA_VERSION = 1;

export interface SaveFile {
  schemaVersion: number;
  rulesetVersion: string;
  savedAt: string;
  mapId: string;
  seats: SeatConfig[];
  /** State at game creation, so the command history replays (§62). */
  initialState: GameState;
  state: GameState;
  commandHistory: GameCommand[];
  /**
   * The current player's undoable actions this turn (§32.1), not yet part of
   * `state`. A save restores exactly what was on screen: loading re-applies
   * these on top of `state`, and they can still be undone. Optional, so
   * schema version 1 files without it stay valid.
   */
  pendingCommands?: GameCommand[];
}

export function isSaveFile(x: unknown): x is SaveFile {
  const s = x as Partial<SaveFile> | null;
  return (
    !!s &&
    typeof s === "object" &&
    s.schemaVersion === SAVE_SCHEMA_VERSION &&
    typeof s.rulesetVersion === "string" &&
    typeof s.mapId === "string" &&
    Array.isArray(s.seats) &&
    !!s.state &&
    !!s.initialState &&
    Array.isArray(s.commandHistory) &&
    (s.pendingCommands === undefined || Array.isArray(s.pendingCommands))
  );
}

// ------------------------------------------------------------------ online API

export interface GuestSessionResponse {
  token: string;
  userId: string;
  displayName: string;
}

export interface CreateMatchRequest {
  displayName: string;
  /** Total seats including the creator (2–4). */
  seatCount: number;
  rulesetName: "mvp" | "standard" | "async";
  /** Seats filled by server-side AI. */
  aiSeats?: { displayName: string; level: AiLevel }[];
}

export interface CreateMatchResponse {
  matchId: string;
  inviteCode: string;
  seat: number;
}

export interface JoinMatchRequest {
  inviteCode: string;
  displayName: string;
}

export interface JoinMatchResponse {
  matchId: string;
  seat: number;
}

export interface MatchSeatInfo {
  seat: number;
  playerId: PlayerId;
  displayName: string;
  kind: "human" | "ai" | "open";
  connected: boolean;
}

export type MatchStatus = "lobby" | "playing" | "finished";

export interface MatchView {
  matchId: string;
  status: MatchStatus;
  inviteCode: string;
  mapId: string;
  ruleset: RulesetConfig;
  seats: MatchSeatInfo[];
  /** The authenticated viewer's player id, if seated. */
  youAre: PlayerId | null;
  revision: number;
  /** Redacted for the viewer (§105); null while in the lobby. */
  state: GameState | null;
}

export interface SubmitCommandsRequest {
  matchId: string;
  expectedRevision: number;
  commands: GameCommand[];
}

export interface SubmitCommandsResponse {
  accepted: boolean;
  revision: number;
  events: GameEvent[];
  state?: GameState;
  error?: RuleError;
}

/** The events one committed command produced, as a given player may see them (§105). */
export interface HistoryEntry {
  /** The match revision this command brought the match to. */
  revision: number;
  events: GameEvent[];
}

/**
 * GET /api/matches/:id/history: the match and the events of every command
 * committed so far, for rebuilding the Chronicle when a player (re)opens it.
 */
export interface MatchHistoryResponse {
  match: MatchView;
  /** One entry per committed command, oldest first, up to `match.revision`. */
  entries: HistoryEntry[];
  /** False if the server could not replay the whole history; the entries then stop early. */
  complete: boolean;
}

/**
 * Machine-readable reasons on HTTP error bodies. Older servers send only
 * `error`, so clients must also handle a missing `code`, and treat a code
 * they do not recognise (added by a newer server) as a generic error.
 * - INVALID_SESSION (401): the token is missing or unknown; start a new session.
 * - COMMAND_ID_CONFLICT (409): a command id was already used for a different command.
 * - DUPLICATE_COMMAND_ID (400): one batch repeats a command id.
 */
export type ApiErrorCode = "INVALID_SESSION" | "COMMAND_ID_CONFLICT" | "DUPLICATE_COMMAND_ID";

/**
 * Body of every non-2xx HTTP response this server sends. A proxy in front of
 * it can answer with a body of its own, so clients must not assume JSON.
 */
export interface ApiErrorBody {
  error: string;
  code?: ApiErrorCode;
}

/** Why a player hears about a match they may not have open (spec §85). */
export type NoticeKind = "your_turn" | "match_over";

/**
 * A notice for one player: over their WebSocket while the app is open
 * anywhere, else as a Web Push message. Worded by the server, since the push
 * service's notification shows it as is.
 */
export interface MatchNotice {
  matchId: string;
  kind: NoticeKind;
  title: string;
  body: string;
  /** The match revision the notice is about, so a client can tell a new turn from one it already announced. */
  revision: number;
}

/**
 * How a WebSocket connection is used (`/api/ws?mode=`). The Android app keeps
 * a "background" connection while it is closed: it gets notices, but it does
 * not make its player look online and is pinged only every few minutes.
 */
export type SocketMode = "app" | "background";

/** POST /api/push/subscribe: a browser's PushSubscription, as `toJSON()` gives it. */
export interface PushSubscriptionRequest {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * GET /api/email, and the answer to POST /api/email ({ address }) and
 * POST /api/email/remove: where this guest's turn emails go. `available` is
 * false when the server has no way to send mail; `confirmed` stays false
 * until the owner opens the link the server emailed.
 */
export interface EmailSettings {
  available: boolean;
  address: string | null;
  confirmed: boolean;
}

/** Server → client push messages over WebSocket. */
export type ServerMessage =
  | { type: "hello"; userId: string }
  | { type: "match_update"; match: MatchView; events: GameEvent[] }
  | { type: "notice"; notice: MatchNotice }
  /**
   * Background connections only: the turns waiting for this player, sent once
   * on connecting, and how often this connection gets a keepalive.
   */
  | { type: "pending_notices"; notices: MatchNotice[]; keepaliveMs: number }
  /** Background connections only: sent with each ping, which the Android app cannot see itself. */
  | { type: "keepalive" }
  | { type: "error"; message: string };

/**
 * Client → server WebSocket messages. A subscribe answers with one
 * match_update; with `since` (the revision the client already shows) that
 * update carries the events after it, so a reconnecting client catches up.
 */
export type ClientMessage = { type: "subscribe"; matchId: string; since?: number } | { type: "unsubscribe"; matchId: string } | { type: "ping" };

// ------------------------------------------------------------------ runtime guards

const COMMAND_TYPES = new Set([
  "place_initial_manor",
  "place_initial_route",
  "assign_initial_banners",
  "build_route",
  "build_manor",
  "upgrade_holding",
  "buy_card",
  "play_card",
  "trade",
  "issue_royal_writ",
  "hire_warden",
  "claim_quest",
  "end_main_phase",
  "assign_banners",
  "discard_cards",
  "end_turn",
  "react",
  "pass_reaction",
  "resolve_prophecy",
]);

/**
 * Structural check for commands arriving from untrusted clients (spec §72).
 * The rules engine performs full legality checks; this only guarantees the
 * envelope and rejects oversized payloads.
 */
export function isWellFormedCommand(x: unknown): x is GameCommand {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const c = x as Record<string, unknown>;
  if (typeof c.type !== "string" || !COMMAND_TYPES.has(c.type)) return false;
  if (typeof c.commandId !== "string" || c.commandId.length > 100) return false;
  if (typeof c.matchId !== "string" || typeof c.playerId !== "string") return false;
  return JSON.stringify(c).length < 8_000;
}

export function isSubmitCommandsRequest(x: unknown): x is SubmitCommandsRequest {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.matchId === "string" &&
    typeof r.expectedRevision === "number" &&
    Array.isArray(r.commands) &&
    r.commands.length > 0 &&
    r.commands.length <= 50 &&
    r.commands.every(isWellFormedCommand)
  );
}
