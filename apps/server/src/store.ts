// Persistence (spec §61) on SQLite via node:sqlite. Stores periodic state
// snapshots (every accepted batch) plus the full command history so matches
// replay (§62). The schema mirrors the spec's recommended tables.

import { DatabaseSync } from "node:sqlite";
import type { GameCommand, GameState, RulesetConfig } from "@manors-menaces/rules";
import type { AiLevel, MatchStatus } from "@manors-menaces/protocol";
import type { StoredSubscription } from "./push.js";

/** Browsers per guest that get turn notices; older subscriptions are dropped. */
const MAX_PUSH_SUBSCRIPTIONS_PER_USER = 10;

export interface UserRow {
  id: string;
  display_name: string;
  token_hash: string;
  created_at: string;
}

export interface EmailRow {
  user_id: string;
  address: string;
  confirm_hash: string | null;
  requested_at: string;
  confirmed_at: string | null;
}

export interface MatchRow {
  id: string;
  status: MatchStatus;
  rules_version: string;
  ruleset: RulesetConfig;
  map_id: string;
  seed: string;
  revision: number;
  invite_code: string;
  active_player_id: string | null;
  state: GameState | null;
  initial_state: GameState | null;
  created_at: string;
  updated_at: string;
}

export interface SeatRow {
  match_id: string;
  seat: number;
  player_id: string;
  user_id: string | null;
  display_name: string;
  kind: "human" | "ai";
  ai_level: AiLevel | null;
}

export class Store {
  readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        rules_version TEXT NOT NULL,
        ruleset TEXT NOT NULL,
        map_id TEXT NOT NULL,
        seed TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 0,
        invite_code TEXT NOT NULL UNIQUE,
        active_player_id TEXT,
        state_snapshot TEXT,
        initial_state TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS match_players (
        match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        seat INTEGER NOT NULL,
        player_id TEXT NOT NULL,
        user_id TEXT REFERENCES users(id),
        display_name TEXT NOT NULL,
        kind TEXT NOT NULL,
        ai_level TEXT,
        PRIMARY KEY (match_id, seat)
      );
      CREATE TABLE IF NOT EXISTS match_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        player_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        command_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (match_id, command_id)
      );
      CREATE INDEX IF NOT EXISTS match_events_by_match ON match_events(match_id, revision);
      CREATE TABLE IF NOT EXISTS server_settings (
        name TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      -- A browser has one endpoint; it follows whichever guest subscribed last.
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS push_subscriptions_by_user ON push_subscriptions(user_id);
      -- Turn emails: an address gets them once its owner confirms it (confirmed_at).
      CREATE TABLE IF NOT EXISTS email_addresses (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        address TEXT NOT NULL,
        confirm_hash TEXT UNIQUE,
        requested_at TEXT NOT NULL,
        confirmed_at TEXT
      );
    `);
  }

  now(): string {
    return new Date().toISOString();
  }

  // ------------------------------------------------------------------ users

  createUser(id: string, displayName: string, tokenHash: string): void {
    this.db.prepare("INSERT INTO users (id, display_name, token_hash, created_at) VALUES (?, ?, ?, ?)").run(id, displayName, tokenHash, this.now());
  }

  userByTokenHash(tokenHash: string): UserRow | undefined {
    return this.db.prepare("SELECT * FROM users WHERE token_hash = ?").get(tokenHash) as UserRow | undefined;
  }

  renameUser(id: string, displayName: string): void {
    this.db.prepare("UPDATE users SET display_name = ? WHERE id = ?").run(displayName, id);
  }

  // ------------------------------------------------------------------ settings

  setting(name: string): string | null {
    return (this.db.prepare("SELECT value FROM server_settings WHERE name = ?").get(name) as { value: string } | undefined)?.value ?? null;
  }

  /** The setting, created from `initial()` the first time it is asked for. */
  settingOr(name: string, initial: () => string): string {
    const existing = this.setting(name);
    if (existing !== null) return existing;
    this.db.prepare("INSERT OR IGNORE INTO server_settings (name, value) VALUES (?, ?)").run(name, initial());
    return this.setting(name) as string;
  }

  // ------------------------------------------------------------------ push subscriptions

  /**
   * Saves a browser's subscription for `userId`, keeping their newest `keep`.
   * A browser signing in as another guest brings the same keys, so the
   * subscription moves to that guest. Another guest's endpoint with different
   * keys is refused (returns false): the endpoint alone does not prove it is
   * the same browser.
   */
  savePushSubscription(userId: string, sub: StoredSubscription, keep = MAX_PUSH_SUBSCRIPTIONS_PER_USER): boolean {
    const existing = this.db.prepare("SELECT user_id, p256dh, auth FROM push_subscriptions WHERE endpoint = ?").get(sub.endpoint) as
      | { user_id: string; p256dh: string; auth: string }
      | undefined;
    if (existing && existing.user_id !== userId && (existing.p256dh !== sub.p256dh || existing.auth !== sub.auth)) return false;
    this.db
      .prepare(
        `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at`,
      )
      .run(sub.endpoint, userId, sub.p256dh, sub.auth, this.now());
    this.db
      .prepare(
        "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint NOT IN (SELECT endpoint FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)",
      )
      .run(userId, userId, keep);
    return true;
  }

  pushSubscriptions(userId: string): StoredSubscription[] {
    return this.db.prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?").all(userId) as unknown as StoredSubscription[];
  }

  /** Removes a subscription; with `userId`, only if it is theirs. */
  removePushSubscription(endpoint: string, userId?: string): void {
    if (userId === undefined) this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
    else this.db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").run(endpoint, userId);
  }

  // ------------------------------------------------------------------ email addresses

  emailAddress(userId: string): EmailRow | undefined {
    return this.db.prepare("SELECT * FROM email_addresses WHERE user_id = ?").get(userId) as EmailRow | undefined;
  }

  /** Sets a new, unconfirmed address; `confirmHash` is the hash of the token its confirmation link carries. */
  requestEmail(userId: string, address: string, confirmHash: string): void {
    this.db
      .prepare(
        `INSERT INTO email_addresses (user_id, address, confirm_hash, requested_at, confirmed_at) VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(user_id) DO UPDATE SET address = excluded.address, confirm_hash = excluded.confirm_hash, requested_at = excluded.requested_at, confirmed_at = NULL`,
      )
      .run(userId, address, confirmHash, this.now());
  }

  /** The unconfirmed address a confirmation token belongs to, if it was asked for after `since`. */
  pendingEmail(confirmHash: string, since: string): EmailRow | undefined {
    return this.db.prepare("SELECT * FROM email_addresses WHERE confirm_hash = ? AND requested_at > ?").get(confirmHash, since) as EmailRow | undefined;
  }

  /** Confirms the address a token belongs to; each token works once. */
  confirmEmail(confirmHash: string, since: string): EmailRow | undefined {
    return this.db
      .prepare("UPDATE email_addresses SET confirmed_at = ?, confirm_hash = NULL WHERE confirm_hash = ? AND requested_at > ? RETURNING *")
      .get(this.now(), confirmHash, since) as EmailRow | undefined;
  }

  removeEmail(userId: string): void {
    this.db.prepare("DELETE FROM email_addresses WHERE user_id = ?").run(userId);
  }

  // ------------------------------------------------------------------ matches

  createMatch(m: { id: string; ruleset: RulesetConfig; rulesVersion: string; mapId: string; seed: string; inviteCode: string }): void {
    const now = this.now();
    this.db
      .prepare("INSERT INTO matches (id, status, rules_version, ruleset, map_id, seed, invite_code, created_at, updated_at) VALUES (?, 'lobby', ?, ?, ?, ?, ?, ?, ?)")
      .run(m.id, m.rulesVersion, JSON.stringify(m.ruleset), m.mapId, m.seed, m.inviteCode, now, now);
  }

  match(id: string): MatchRow | undefined {
    const r = this.db.prepare("SELECT * FROM matches WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return r ? this.toMatch(r) : undefined;
  }

  matchByInvite(code: string): MatchRow | undefined {
    const r = this.db.prepare("SELECT * FROM matches WHERE invite_code = ?").get(code) as Record<string, unknown> | undefined;
    return r ? this.toMatch(r) : undefined;
  }

  matchesForUser(userId: string): MatchRow[] {
    const rows = this.db
      .prepare(
        "SELECT m.* FROM matches m JOIN match_players p ON p.match_id = m.id WHERE p.user_id = ? ORDER BY m.updated_at DESC LIMIT 50",
      )
      .all(userId) as Record<string, unknown>[];
    return rows.map((r) => this.toMatch(r));
  }

  playingMatchIds(): string[] {
    return (this.db.prepare("SELECT id FROM matches WHERE status = 'playing'").all() as { id: string }[]).map((r) => r.id);
  }

  private toMatch(r: Record<string, unknown>): MatchRow {
    return {
      id: r.id as string,
      status: r.status as MatchStatus,
      rules_version: r.rules_version as string,
      ruleset: JSON.parse(r.ruleset as string) as RulesetConfig,
      map_id: r.map_id as string,
      seed: r.seed as string,
      revision: r.revision as number,
      invite_code: r.invite_code as string,
      active_player_id: (r.active_player_id as string | null) ?? null,
      state: r.state_snapshot ? (JSON.parse(r.state_snapshot as string) as GameState) : null,
      initial_state: r.initial_state ? (JSON.parse(r.initial_state as string) as GameState) : null,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    };
  }

  startMatch(id: string, state: GameState): void {
    this.db
      .prepare("UPDATE matches SET status = 'playing', state_snapshot = ?, initial_state = ?, revision = ?, active_player_id = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(state), JSON.stringify(state), state.revision, state.activePlayerId, this.now(), id);
  }

  /**
   * Persist an accepted batch atomically: the new snapshot plus one event row
   * per command. The revision guard makes concurrent writers fail cleanly.
   */
  commitBatch(id: string, fromRevision: number, state: GameState, commands: GameCommand[]): boolean {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const res = this.db
        .prepare("UPDATE matches SET state_snapshot = ?, revision = ?, active_player_id = ?, status = ?, updated_at = ? WHERE id = ? AND revision = ?")
        .run(JSON.stringify(state), state.revision, state.activePlayerId, state.status === "finished" ? "finished" : "playing", this.now(), id, fromRevision);
      if (Number(res.changes) !== 1) {
        this.db.exec("ROLLBACK");
        return false;
      }
      const insert = this.db.prepare(
        "INSERT INTO match_events (match_id, revision, player_id, command_id, command_type, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      );
      commands.forEach((c, i) => insert.run(id, fromRevision + i + 1, c.playerId, c.commandId, c.type, JSON.stringify(c), this.now()));
      this.db.exec("COMMIT");
      return true;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  commandHistory(id: string): GameCommand[] {
    return (this.db.prepare("SELECT payload FROM match_events WHERE match_id = ? ORDER BY revision").all(id) as { payload: string }[]).map(
      (r) => JSON.parse(r.payload) as GameCommand,
    );
  }

  /** The committed commands with the revision each brought the match to, oldest first. */
  commandRows(id: string): { revision: number; command: GameCommand }[] {
    return (this.db.prepare("SELECT revision, payload FROM match_events WHERE match_id = ? ORDER BY revision").all(id) as { revision: number; payload: string }[]).map(
      (r) => ({ revision: r.revision, command: JSON.parse(r.payload) as GameCommand }),
    );
  }

  /** Already-committed commands among `commandIds`, keyed by id. */
  commandsByIds(matchId: string, commandIds: string[]): Map<string, GameCommand> {
    if (commandIds.length === 0) return new Map();
    const rows = this.db
      .prepare(`SELECT command_id, payload FROM match_events WHERE match_id = ? AND command_id IN (${commandIds.map(() => "?").join(", ")})`)
      .all(matchId, ...commandIds) as { command_id: string; payload: string }[];
    return new Map(rows.map((r) => [r.command_id, JSON.parse(r.payload) as GameCommand]));
  }

  // ------------------------------------------------------------------ seats

  addSeat(s: SeatRow): void {
    this.db
      .prepare("INSERT INTO match_players (match_id, seat, player_id, user_id, display_name, kind, ai_level) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(s.match_id, s.seat, s.player_id, s.user_id, s.display_name, s.kind, s.ai_level);
  }

  claimSeat(matchId: string, seat: number, userId: string, displayName: string): void {
    this.db.prepare("UPDATE match_players SET user_id = ?, display_name = ? WHERE match_id = ? AND seat = ?").run(userId, displayName, matchId, seat);
  }

  seats(matchId: string): SeatRow[] {
    return this.db.prepare("SELECT * FROM match_players WHERE match_id = ? ORDER BY seat").all(matchId) as unknown as SeatRow[];
  }
}
