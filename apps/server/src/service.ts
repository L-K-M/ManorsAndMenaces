// Match service: server-authoritative command handling (spec §59–60, §72,
// §88). Clients never submit state; every command is validated by the shared
// rules engine, the RNG lives on the server, and each viewer only receives
// their own hidden information (§105).

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chooseAction, fallbackIntents } from "@manors-menaces/ai";
import { rulesContentFor } from "@manors-menaces/content";
import type {
  ApiErrorCode,
  CreateMatchRequest,
  GuestSessionResponse,
  HistoryEntry,
  MatchHistoryResponse,
  MatchNotice,
  MatchSeatInfo,
  MatchView,
  SubmitCommandsRequest,
  SubmitCommandsResponse,
} from "@manors-menaces/protocol";
import {
  RULESET_VERSION,
  asyncRuleset,
  createRng,
  createRulesEngine,
  mvpRuleset,
  redactEvent,
  redactState,
  seedRng,
  standardRuleset,
  type GameCommand,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RulesEngine,
} from "@manors-menaces/rules";
import { actorOf, noticeFor, noticesAfter } from "./notices.js";
import type { MatchRow, SeatRow, Store, UserRow } from "./store.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: ApiErrorCode,
  ) {
    super(message);
  }
}

export interface MatchListener {
  (matchId: string, events: GameEvent[]): void;
}

const MAP_ID = "greenvale";
/** Pause before an AI seat that found no usable move tries again; it doubles on each failure in a row. */
const AI_RETRY_MS = 5_000;
/** Cap on that growing pause, so a match stuck on a bug does not flood the log. */
const AI_RETRY_MAX_MS = 5 * 60_000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cleanName(name: unknown): string {
  // Strip control characters and angle brackets from display names.
  // eslint-disable-next-line no-control-regex
  const s = typeof name === "string" ? name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24) : "";
  return s || "Guest";
}

/** JSON with object keys sorted, so equal commands compare equal whatever their key order. */
function canonicalJson(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonicalJson).join(",")}]`;
  if (x && typeof x === "object") {
    const entries = Object.entries(x as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(x) ?? "null";
}

export class MatchService {
  private readonly engine: RulesEngine;
  private readonly listeners = new Set<MatchListener>();
  private readonly aiTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** AI steps in a row that failed, per match; sets the retry delay. */
  private readonly aiFailures = new Map<string, number>();
  private closed = false;
  /** Presence callback set by the transport layer (WebSocket connections). */
  isConnected: (userId: string) => boolean = () => false;
  /** Delivery of a notice to a user, set by the transport layer (WebSocket or Web Push). */
  notify: (userId: string, notice: MatchNotice) => void = () => {};

  constructor(
    private readonly store: Store,
    private readonly opts: { aiDelayMs: number } = { aiDelayMs: 700 },
  ) {
    this.engine = createRulesEngine(rulesContentFor(MAP_ID));
  }

  onMatchUpdate(fn: MatchListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ------------------------------------------------------------------ auth (§73)

  createGuest(displayName: unknown): GuestSessionResponse {
    const token = randomBytes(32).toString("hex");
    const userId = `u_${randomUUID()}`;
    const name = cleanName(displayName);
    this.store.createUser(userId, name, hashToken(token));
    return { token, userId, displayName: name };
  }

  authenticate(token: string | null | undefined): UserRow {
    if (!token || token.length > 200) throw new HttpError(401, "missing or invalid token", "INVALID_SESSION");
    const user = this.store.userByTokenHash(hashToken(token));
    if (!user) throw new HttpError(401, "unknown session", "INVALID_SESSION");
    return user;
  }

  // ------------------------------------------------------------------ lobby

  createMatch(user: UserRow, req: CreateMatchRequest): { matchId: string; inviteCode: string; seat: number } {
    const seatCount = Number(req?.seatCount);
    if (!Number.isInteger(seatCount) || seatCount < 2 || seatCount > 4) throw new HttpError(400, "seatCount must be 2–4");
    const aiSeats = Array.isArray(req.aiSeats) ? req.aiSeats.slice(0, seatCount - 1) : [];
    const ruleset = req.rulesetName === "mvp" ? mvpRuleset() : req.rulesetName === "async" ? asyncRuleset(seatCount) : standardRuleset(seatCount);
    const matchId = `m_${randomUUID()}`;
    const inviteCode = randomBytes(5).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "X").slice(0, 6);
    this.store.createMatch({ id: matchId, ruleset, rulesVersion: RULESET_VERSION, mapId: MAP_ID, seed: randomBytes(16).toString("hex"), inviteCode });
    const humanSeats = seatCount - aiSeats.length;
    for (let seat = 0; seat < seatCount; seat++) {
      const ai = seat >= humanSeats ? aiSeats[seat - humanSeats] : undefined;
      this.store.addSeat({
        match_id: matchId,
        seat,
        player_id: `P${seat + 1}`,
        user_id: seat === 0 ? user.id : null,
        display_name: seat === 0 ? cleanName(req.displayName ?? user.display_name) : ai ? cleanName(ai.displayName) : "Open seat",
        kind: ai ? "ai" : "human",
        ai_level: ai ? (["easy", "normal", "hard"].includes(ai.level) ? ai.level : "normal") : null,
      });
    }
    this.maybeStart(matchId);
    return { matchId, inviteCode, seat: 0 };
  }

  joinMatch(user: UserRow, inviteCode: unknown, displayName: unknown): { matchId: string; seat: number } {
    const match = typeof inviteCode === "string" ? this.store.matchByInvite(inviteCode.trim().toUpperCase()) : undefined;
    if (!match) throw new HttpError(404, "no match with that invite code");
    const seats = this.store.seats(match.id);
    const existing = seats.find((s) => s.user_id === user.id);
    if (existing) return { matchId: match.id, seat: existing.seat };
    if (match.status !== "lobby") throw new HttpError(409, "match already started");
    const open = seats.find((s) => s.kind === "human" && !s.user_id);
    if (!open) throw new HttpError(409, "match is full");
    this.store.claimSeat(match.id, open.seat, user.id, cleanName(displayName ?? user.display_name));
    this.maybeStart(match.id);
    return { matchId: match.id, seat: open.seat };
  }

  /** Starts the game once every human seat is filled. */
  private maybeStart(matchId: string): void {
    const match = this.store.match(matchId);
    if (!match || match.status !== "lobby") return;
    const seats = this.store.seats(matchId);
    if (seats.some((s) => s.kind === "human" && !s.user_id)) {
      this.emit(matchId, []);
      return;
    }
    const state = this.engine.createGame({
      matchId,
      seed: match.seed,
      rulesetVersion: match.rules_version,
      ruleset: match.ruleset,
      players: seats.map((s) => ({ id: s.player_id, displayName: s.display_name })),
    });
    this.store.startMatch(matchId, state);
    this.emit(matchId, []);
    this.announce(matchId, null, state);
    this.scheduleAi(matchId);
  }

  // ------------------------------------------------------------------ views

  view(matchId: string, user: UserRow | null): MatchView {
    const match = this.store.match(matchId);
    if (!match) throw new HttpError(404, "no such match");
    const seats = this.store.seats(matchId);
    const mine = user ? seats.find((s) => s.user_id === user.id) : undefined;
    if (!mine) throw new HttpError(403, "not a member of this match");
    return {
      matchId,
      status: match.status,
      inviteCode: match.invite_code,
      mapId: match.map_id,
      ruleset: match.ruleset,
      seats: seats.map(
        (s): MatchSeatInfo => ({
          seat: s.seat,
          playerId: s.player_id,
          displayName: s.display_name,
          kind: s.kind === "ai" ? "ai" : s.user_id ? "human" : "open",
          connected: s.kind === "ai" || (!!s.user_id && this.isConnected(s.user_id)),
        }),
      ),
      youAre: mine.player_id,
      revision: match.revision,
      state: match.state ? redactState(match.state, mine.player_id) : null,
    };
  }

  listMatches(user: UserRow): MatchView[] {
    return this.store.matchesForUser(user.id).map((m) => this.view(m.id, user));
  }

  listMatchIdsForUser(userId: string): string[] {
    return this.store.matchesForUser(userId).map((m) => m.id);
  }

  /** A "your turn" notice for each of the user's matches that is waiting for them. */
  pendingNotices(userId: string): MatchNotice[] {
    const notices: MatchNotice[] = [];
    for (const match of this.store.matchesForUser(userId)) {
      if (match.status !== "playing" || !match.state) continue;
      const playerId = this.memberPlayerId(match.id, userId);
      if (playerId && actorOf(match.state) === playerId) notices.push(noticeFor(match.id, "your_turn", playerId, match.state));
    }
    return notices;
  }

  memberPlayerId(matchId: string, userId: string): PlayerId | null {
    return this.store.seats(matchId).find((s) => s.user_id === userId)?.player_id ?? null;
  }

  // ------------------------------------------------------------------ commands (§59)

  submit(user: UserRow, req: SubmitCommandsRequest): SubmitCommandsResponse {
    const match = this.store.match(req.matchId);
    if (!match || !match.state) throw new HttpError(404, "no such match or not started");
    const playerId = this.memberPlayerId(match.id, user.id);
    if (!playerId) throw new HttpError(403, "not a member of this match");
    // Commands may only be issued for the authenticated player's own seat.
    if (req.commands.some((c) => c.playerId !== playerId || c.matchId !== match.id)) throw new HttpError(403, "commands must be for your own seat");
    // Idempotency (§60): a retry of an applied batch gets its original
    // result back; an applied id reused for anything else is a conflict.
    const ids = req.commands.map((c) => c.commandId);
    if (new Set(ids).size !== ids.length) throw new HttpError(400, "a batch must not repeat a command id", "DUPLICATE_COMMAND_ID");
    const applied = this.store.commandsByIds(match.id, ids);
    if (applied.size > 0) {
      const identical = applied.size === ids.length && req.commands.every((c) => canonicalJson(applied.get(c.commandId)) === canonicalJson(c));
      if (!identical) throw new HttpError(409, "command id already used for a different command", "COMMAND_ID_CONFLICT");
      const events = this.committedEvents(match, new Set(ids)).map((e) => redactEvent(e, playerId));
      return { accepted: true, revision: match.revision, events, state: redactState(match.state, playerId) };
    }
    if (req.expectedRevision !== match.revision) {
      return { accepted: false, revision: match.revision, events: [], state: redactState(match.state, playerId), error: { code: "REVISION_MISMATCH" } };
    }
    const r = this.engine.applyBatch(match.state, req.commands);
    if (!r.accepted || !r.newState) {
      return { accepted: false, revision: match.revision, events: [], ...(r.error ? { error: r.error } : {}) };
    }
    if (!this.store.commitBatch(match.id, match.revision, r.newState, req.commands)) {
      const fresh = this.store.match(match.id);
      return { accepted: false, revision: fresh?.revision ?? match.revision, events: [], error: { code: "REVISION_MISMATCH" } };
    }
    this.emit(match.id, r.events);
    this.announce(match.id, match.state, r.newState);
    this.scheduleAi(match.id);
    return { accepted: true, revision: r.newState.revision, events: r.events.map((e) => redactEvent(e, playerId)), state: redactState(r.newState, playerId) };
  }

  /**
   * The events that already-committed commands produced. Only idempotent
   * retries after a lost response pay for this replay.
   */
  private committedEvents(match: MatchRow, commandIds: Set<string>): GameEvent[] {
    const events: GameEvent[] = [];
    let remaining = commandIds.size;
    // A history that no longer replays is a server bug; the retry still
    // succeeds, only without its Chronicle entries.
    const complete = this.replay(match, (_revision, command, commandEvents) => {
      if (commandIds.has(command.commandId)) {
        events.push(...commandEvents);
        remaining--;
      }
      return remaining > 0;
    });
    return complete ? events : [];
  }

  /**
   * The match and every committed command's events as the viewer may see
   * them (§105), so a player who (re)opens a match gets its Chronicle back,
   * including the moves made while they were away.
   */
  history(matchId: string, user: UserRow): MatchHistoryResponse {
    const match = this.view(matchId, user);
    const row = this.store.match(matchId);
    const entries: HistoryEntry[] = [];
    const complete = !row || this.replay(row, (revision, _command, events) => void entries.push({ revision, events: events.map((e) => redactEvent(e, match.youAre)) }));
    return { match, entries, complete };
  }

  /**
   * The unredacted events of the commands after revision `since`, for a
   * client that reconnects: the caller redacts them for its viewer.
   */
  eventsSince(matchId: string, since: number): GameEvent[] {
    const match = this.store.match(matchId);
    if (!match || since >= match.revision) return [];
    const events: GameEvent[] = [];
    this.replay(match, (revision, _command, commandEvents) => {
      if (revision > since) events.push(...commandEvents);
    });
    return events;
  }

  /**
   * Replays the history from the initial state (§62), handing `visit` each
   * command's events; events are not stored. `visit` returns false once it
   * has all it needs. Returns false if the history no longer replays.
   */
  private replay(match: MatchRow, visit: (revision: number, command: GameCommand, events: GameEvent[]) => boolean | void): boolean {
    let state = match.initial_state;
    if (!state) return true;
    for (const { revision, command } of this.store.commandRows(match.id)) {
      const r = this.engine.applyCommand(state, command);
      if (!r.accepted || !r.newState) {
        console.error(`history of ${match.id} does not replay at ${command.commandId}`, r.error);
        return false;
      }
      if (visit(revision, command, r.events) === false) return true;
      state = r.newState;
    }
    return true;
  }

  // ------------------------------------------------------------------ AI seats

  /**
   * Schedules every AI seat that is due to act. AI turns run on in-memory
   * timers, so this must run at startup or matches stall after a restart.
   */
  resumeAll(): void {
    for (const matchId of this.store.playingMatchIds()) this.scheduleAi(matchId);
  }

  private scheduleAi(matchId: string): void {
    if (this.closed || this.aiTimers.has(matchId)) return;
    const match = this.store.match(matchId);
    if (!match?.state) return;
    const actor = actorOf(match.state);
    const seat = this.store.seats(matchId).find((s) => s.player_id === actor);
    if (!seat || seat.kind !== "ai") return;
    this.aiTimers.set(
      matchId,
      setTimeout(() => {
        this.aiTimers.delete(matchId);
        this.guardAi(matchId, () => this.runAiStep(matchId, seat));
      }, this.opts.aiDelayMs),
    );
  }

  private runAiStep(matchId: string, seat: SeatRow): void {
    const match = this.store.match(matchId);
    if (!match?.state || actorOf(match.state) !== seat.player_id) return;
    const rng = createRng(seedRng(`${match.seed}:ai:${match.revision}`));
    const intent = chooseAction(this.engine, match.state, seat.player_id, { level: seat.ai_level ?? "normal", rng });
    if (!intent) {
      console.error(`AI seat ${seat.player_id} in ${matchId} chose no action; retrying later`);
      this.retryAiLater(matchId);
      return;
    }
    const make = (i: typeof intent): GameCommand =>
      ({ ...i, commandId: `ai-${match.revision}-${randomUUID()}`, matchId, playerId: seat.player_id }) as GameCommand;
    let command = make(intent);
    let r = this.engine.applyCommand(match.state, command);
    // Never let a rejected AI move stall the match: try each progression move.
    const s = match.state;
    for (const f of fallbackIntents(this.engine.ctx, s, seat.player_id)) {
      if (r.accepted) break;
      command = make(f);
      r = this.engine.applyCommand(s, command);
    }
    if (!r.accepted || !r.newState) {
      console.error(`AI seat ${seat.player_id} in ${matchId} has no legal move; retrying later`, r.error);
      this.retryAiLater(matchId);
      return;
    }
    if (this.store.commitBatch(matchId, match.revision, r.newState, [command])) {
      this.aiFailures.delete(matchId);
      this.emit(matchId, r.events);
      this.announce(matchId, match.state, r.newState);
    }
    this.scheduleAi(matchId);
  }

  /**
   * Runs the body of an AI timer. main.ts exits on uncaught exceptions, and
   * resumeAll() would replay the same seeded step after the restart, so a bug
   * in the engine or AI must stall only its own match, never the server.
   */
  private guardAi(matchId: string, step: () => void): void {
    try {
      step();
    } catch (e) {
      console.error(`AI step in ${matchId} failed; retrying later`, e);
      this.retryAiLater(matchId);
    }
  }

  /** Tracked like a normal AI step, so shutdown cancels it and it never doubles up. */
  private retryAiLater(matchId: string): void {
    if (this.closed || this.aiTimers.has(matchId)) return;
    const failures = this.aiFailures.get(matchId) ?? 0;
    this.aiFailures.set(matchId, failures + 1);
    this.aiTimers.set(
      matchId,
      setTimeout(
        () => {
          this.aiTimers.delete(matchId);
          this.guardAi(matchId, () => this.scheduleAi(matchId));
        },
        Math.min(AI_RETRY_MS * 2 ** failures, AI_RETRY_MAX_MS),
      ),
    );
  }

  /** Tells the humans who must act now, or whose match just ended (spec §85). */
  private announce(matchId: string, before: GameState | null, after: GameState): void {
    const due = noticesAfter(before, after);
    if (due.length === 0) return;
    const seats = this.store.seats(matchId);
    for (const { playerId, kind } of due) {
      const seat = seats.find((s) => s.player_id === playerId);
      if (seat?.kind !== "human" || !seat.user_id) continue;
      this.notify(seat.user_id, noticeFor(matchId, kind, playerId, after));
    }
  }

  private emit(matchId: string, events: GameEvent[]): void {
    for (const fn of this.listeners) fn(matchId, events);
  }

  /** Full, unredacted history for replays/debugging (§62). */
  replayData(matchId: string): { initial: GameState | null; commands: GameCommand[] } {
    const m = this.store.match(matchId);
    // rngState + commands are enough to replay; the seed itself stays private (§105).
    return { initial: m?.initial_state ? { ...m.initial_state, seed: "hidden" } : null, commands: this.store.commandHistory(matchId) };
  }

  shutdown(): void {
    this.closed = true;
    for (const t of this.aiTimers.values()) clearTimeout(t);
    this.aiTimers.clear();
  }
}
