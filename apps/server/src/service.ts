// Match service: server-authoritative command handling (spec §59–60, §72,
// §88). Clients never submit state; every command is validated by the shared
// rules engine, the RNG lives on the server, and each viewer only receives
// their own hidden information (§105).

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chooseAction } from "@manors-menaces/ai";
import { rulesContentFor } from "@manors-menaces/content";
import type {
  CreateMatchRequest,
  GuestSessionResponse,
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
import type { SeatRow, Store, UserRow } from "./store.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface MatchListener {
  (matchId: string, events: GameEvent[]): void;
}

const MAP_ID = "greenvale";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cleanName(name: unknown): string {
  const s = typeof name === "string" ? name.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24) : "";
  return s || "Guest";
}

export class MatchService {
  private readonly engine: RulesEngine;
  private readonly listeners = new Set<MatchListener>();
  private readonly aiTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    if (!token || token.length > 200) throw new HttpError(401, "missing or invalid token");
    const user = this.store.userByTokenHash(hashToken(token));
    if (!user) throw new HttpError(401, "unknown session");
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
          connected: false,
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
    // Idempotency: a retried batch whose commands were already applied.
    if (req.commands.every((c) => this.store.hasCommand(match.id, c.commandId))) {
      return { accepted: true, revision: match.revision, events: [], state: redactState(match.state, playerId) };
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
    this.scheduleAi(match.id);
    return { accepted: true, revision: r.newState.revision, events: r.events.map((e) => redactEvent(e, playerId)), state: redactState(r.newState, playerId) };
  }

  // ------------------------------------------------------------------ AI seats

  private actorOf(state: GameState): PlayerId | null {
    if (state.status === "finished") return null;
    if (state.pending?.kind === "reaction") return state.pending.eligiblePlayerIds[0] ?? null;
    if (state.pending?.kind === "prophecy") return state.pending.playerId;
    return state.activePlayerId;
  }

  private scheduleAi(matchId: string): void {
    if (this.aiTimers.has(matchId)) return;
    const match = this.store.match(matchId);
    if (!match?.state) return;
    const actor = this.actorOf(match.state);
    const seat = this.store.seats(matchId).find((s) => s.player_id === actor);
    if (!seat || seat.kind !== "ai") return;
    this.aiTimers.set(
      matchId,
      setTimeout(() => {
        this.aiTimers.delete(matchId);
        this.runAiStep(matchId, seat);
      }, this.opts.aiDelayMs),
    );
  }

  private runAiStep(matchId: string, seat: SeatRow): void {
    const match = this.store.match(matchId);
    if (!match?.state || this.actorOf(match.state) !== seat.player_id) return;
    const rng = createRng(seedRng(`${match.seed}:ai:${match.revision}`));
    let intent = chooseAction(this.engine, match.state, seat.player_id, { level: seat.ai_level ?? "normal", rng });
    if (!intent) return;
    const make = (i: typeof intent): GameCommand =>
      ({ ...i, commandId: `ai-${match.revision}-${randomUUID()}`, matchId, playerId: seat.player_id }) as GameCommand;
    let command = make(intent);
    let r = this.engine.applyCommand(match.state, command);
    if (!r.accepted) {
      const s = match.state;
      intent = s.phase === "main" ? { type: "end_main_phase" } : s.phase === "banner_assignment" ? { type: "assign_banners", assignments: {} } : { type: "end_turn" };
      command = make(intent);
      r = this.engine.applyCommand(s, command);
    }
    if (!r.accepted || !r.newState) return;
    if (this.store.commitBatch(matchId, match.revision, r.newState, [command])) this.emit(matchId, r.events);
    this.scheduleAi(matchId);
  }

  private emit(matchId: string, events: GameEvent[]): void {
    for (const fn of this.listeners) fn(matchId, events);
  }

  /** Full, unredacted history for replays/debugging (§62). */
  replayData(matchId: string): { initial: GameState | null; commands: GameCommand[] } {
    const m = this.store.match(matchId);
    return { initial: m?.initial_state ?? null, commands: this.store.commandHistory(matchId) };
  }

  shutdown(): void {
    for (const t of this.aiTimers.values()) clearTimeout(t);
    this.aiTimers.clear();
  }
}
