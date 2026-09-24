// Client-side game session (spec §45). Holds the authoritative state, a draft
// of undoable actions (§32.1), UI-facing log/feedback, AI scheduling and the
// hot-seat privacy curtain. Rules decisions are delegated to the engine.

import { chooseAction } from "@manors-menaces/ai";
import { SAVE_SCHEMA_VERSION, type SaveFile, type SeatConfig } from "@manors-menaces/protocol";
import {
  RULESET_VERSION,
  UNDO_SAFE_COMMANDS,
  createRng,
  seedRng,
  type CommandIntent,
  type GameCommand,
  type GameEvent,
  type GameRng,
  type GameState,
  type PlayerId,
  type RulesEngine,
  type RulesetConfig,
} from "@manors-menaces/rules";
import { playForEvents, play } from "../audio/sfx.js";
import { t } from "../i18n.js";
import { platform } from "../platform/adapter.js";
import { aiDelayMs, settings } from "../stores/settings.svelte.js";
import { engineFor, mapFor } from "./engine.js";
import { formatEvents, type LogEntry } from "./log.js";
import { recordGame } from "./telemetry.js";
import { devlog } from "../devlog.js";

export interface Floater {
  id: number;
  playerId: PlayerId;
  text: string;
  resource: string;
}

/** Transport for submitting command batches (local engine or online server). */
export interface Transport {
  readonly kind: "local" | "online";
  submit(
    commands: GameCommand[],
    expectedRevision: number,
  ): Promise<{ ok: true; state: GameState; events: GameEvent[] } | { ok: false; code: string; state?: GameState }>;
  close?(): void;
}

export interface NewGameOptions {
  seats: SeatConfig[];
  ruleset: RulesetConfig;
  seed?: string;
  mapId?: string;
  matchId?: string;
}

let floaterId = 1;
let commandSeq = 0;

/** Who must act next: reaction/prophecy decisions come before the active player. */
export function currentActor(state: GameState): PlayerId | null {
  if (state.status === "finished") return null;
  if (state.pending?.kind === "reaction") return state.pending.eligiblePlayerIds[0] ?? null;
  if (state.pending?.kind === "prophecy") return state.pending.playerId;
  return state.activePlayerId;
}

export class GameSession {
  readonly engine: RulesEngine;
  readonly mapId: string;
  readonly seats: SeatConfig[];
  readonly initialState: GameState;
  readonly transport: Transport;

  // Game state is immutable plain data (§106): the engine returns a new
  // object for every change and nothing here mutates one in place. `$state.raw`
  // tracks reassignment only, so selectors and the AI read plain objects
  // instead of deep proxies (15 to 130 times faster). Always replace these,
  // never mutate them.
  authoritative: GameState = $state.raw() as GameState;
  draft: GameState = $state.raw() as GameState;
  buffered: GameCommand[] = $state.raw([]);
  log: LogEntry[] = $state.raw([]);
  floaters: Floater[] = $state.raw([]);
  error: string | null = $state(null);
  busy = $state(false);
  /** Player whose private information (hand) the UI shows. */
  viewerId: PlayerId | null = $state(null);
  /** Hot-seat: waiting for this player to take the device. */
  curtainFor: PlayerId | null = $state(null);
  /** Online: which seats currently have a live connection. */
  presence: Record<PlayerId, boolean> = $state.raw({});
  /** Online: this client's seat. */
  readonly onlinePlayerId: PlayerId | null;

  private commandHistory: GameCommand[] = [];
  private undoStack: { state: GameState; logIds: number[] }[] = [];
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private aiRng: GameRng;
  private destroyed = false;
  private listeners = new Set<(events: GameEvent[], state: GameState) => void>();

  constructor(opts: {
    mapId: string;
    seats: SeatConfig[];
    initialState: GameState;
    state: GameState;
    history?: GameCommand[];
    transport?: Transport;
    onlinePlayerId?: PlayerId | null;
  }) {
    this.engine = engineFor(opts.mapId);
    this.mapId = opts.mapId;
    this.seats = opts.seats;
    this.initialState = opts.initialState;
    this.commandHistory = [...(opts.history ?? [])];
    this.onlinePlayerId = opts.onlinePlayerId ?? null;
    this.transport = opts.transport ?? this.localTransport();
    this.authoritative = opts.state;
    this.draft = opts.state;
    this.aiRng = createRng(seedRng(`${opts.state.matchId}:ai:${opts.state.revision}`));
    this.viewerId = this.onlinePlayerId ?? this.firstHuman();
    this.afterStateChange([]);
  }

  static create(opts: NewGameOptions): GameSession {
    const mapId = opts.mapId ?? "greenvale";
    const engine = engineFor(mapId);
    const seed = opts.seed ?? `${Date.now().toString(36)}-${Math.floor(performance.now() * 1000).toString(36)}`;
    const initialState = engine.createGame({
      matchId: opts.matchId ?? `local-${seed}`,
      seed,
      rulesetVersion: RULESET_VERSION,
      ruleset: opts.ruleset,
      players: opts.seats.map((s) => ({ id: s.playerId, displayName: s.displayName })),
    });
    return new GameSession({ mapId, seats: opts.seats, initialState, state: initialState });
  }

  static fromSave(save: SaveFile): GameSession {
    return new GameSession({ mapId: save.mapId, seats: save.seats, initialState: save.initialState, state: save.state, history: save.commandHistory });
  }

  get map() {
    return mapFor(this.mapId);
  }

  get ctx() {
    return this.engine.ctx;
  }

  seat(playerId: PlayerId | null | undefined): SeatConfig | undefined {
    return this.seats.find((s) => s.playerId === playerId);
  }

  isHuman(playerId: PlayerId | null | undefined): boolean {
    return this.seat(playerId)?.kind === "human";
  }

  private firstHuman(): PlayerId | null {
    return this.seats.find((s) => s.kind === "human")?.playerId ?? null;
  }

  /** The player this client may act for right now, if any. */
  get localActor(): PlayerId | null {
    const actor = currentActor(this.draft);
    if (!actor) return null;
    if (this.transport.kind === "online") return actor === this.onlinePlayerId ? actor : null;
    if (!this.isHuman(actor) || this.curtainFor) return null;
    return actor;
  }

  onEvents(fn: (events: GameEvent[], state: GameState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ------------------------------------------------------------------ actions

  /** Perform an action for the local actor. Returns false if rejected. */
  async perform(intent: CommandIntent): Promise<boolean> {
    const actor = this.localActor;
    if (!actor || this.busy) return false;
    const command = this.envelope(actor, intent);
    const r = this.engine.applyCommand(this.draft, command);
    devlog("command", command.type, { command, accepted: r.accepted, error: r.error });
    if (!r.accepted || !r.newState) {
      this.showError(r.error?.code ?? "INVALID_COMMAND");
      return false;
    }
    devlog("event", `${r.events.length} events`, r.events);
    this.error = null;
    const actorChanged = currentActor(r.newState) !== actor;
    if (UNDO_SAFE_COMMANDS.has(command.type) && !actorChanged) {
      // Buffered locally (§32.1): show it now, provisionally, so it can be undone.
      const logIds = this.appendLog(r.events, r.newState, true);
      playForEvents(r.events);
      this.undoStack.push({ state: this.draft, logIds });
      this.buffered = [...this.buffered, command];
      this.draft = r.newState;
      this.notify(r.events, r.newState);
      return true;
    }
    // Locking commands are logged from the authoritative result, so an online
    // draft built on redacted state (e.g. a card draw) is never shown.
    this.draft = r.newState;
    await this.flush([...this.buffered, command]);
    return true;
  }

  get canUndo(): boolean {
    // `buffered` is reactive and mirrors the undo stack one-to-one.
    return this.buffered.length > 0 && !this.busy;
  }

  undo(): void {
    const last = this.undoStack.pop();
    if (!last) return;
    this.draft = last.state;
    this.buffered = this.buffered.slice(0, -1);
    const drop = new Set(last.logIds);
    this.log = this.log.filter((e) => !drop.has(e.id));
    this.error = null;
  }

  private inFlight = 0;

  private async flush(batch: GameCommand[]): Promise<void> {
    this.busy = true;
    this.inFlight = batch.length;
    const base = this.authoritative.revision;
    try {
      let res = await this.transport.submit(batch, base);
      // A network failure may hide a committed batch: retry the same command
      // ids, which the server treats idempotently (§60), before giving up.
      for (let attempt = 1; !res.ok && res.code === "NETWORK" && attempt <= 3 && !this.destroyed; attempt++) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        res = await this.transport.submit(batch, base);
      }
      devlog("network", `submitted ${batch.length} command(s) via ${this.transport.kind}`, res.ok ? { revision: res.state.revision } : res);
      this.log = this.log.filter((e) => !e.provisional);
      if (!res.ok) {
        this.showError(res.code);
        // Reconcile: drop the draft and return to the authoritative state (§60).
        if (res.state && res.state.revision >= this.authoritative.revision) this.authoritative = res.state;
        this.draft = this.authoritative;
        this.buffered = [];
        this.undoStack = [];
        return;
      }
      if (this.transport.kind === "local") this.commandHistory.push(...batch);
      this.appendLog(res.events, res.state);
      playForEvents(res.events);
      // A WebSocket push may already have delivered a newer state (e.g. an AI
      // seat acted right after our batch); never go backwards.
      if (res.state.revision >= this.authoritative.revision) this.authoritative = res.state;
      this.draft = this.authoritative;
      this.buffered = [];
      this.undoStack = [];
      this.notify(res.events, res.state);
      this.afterStateChange(res.events);
    } finally {
      this.busy = false;
      this.inFlight = 0;
    }
  }

  /** Online: a server push with new state from another player's action. */
  receiveRemote(state: GameState, events: GameEvent[]): void {
    if (state.revision <= this.authoritative.revision) return;
    // The echo of our own in-flight batch: its events are logged when the
    // HTTP response arrives, so only adopt the state here.
    const ownEcho = this.inFlight > 0 && state.revision === this.authoritative.revision + this.inFlight;
    this.authoritative = state;
    if (!this.busy) {
      this.draft = state;
      this.buffered = [];
      this.undoStack = [];
      this.log = this.log.filter((e) => !e.provisional);
    }
    if (!ownEcho) {
      this.appendLog(events, state);
      playForEvents(events);
    }
    this.notify(events, state);
    this.afterStateChange(events);
  }

  private envelope(playerId: PlayerId, intent: CommandIntent): GameCommand {
    return { ...intent, commandId: `${playerId}-${Date.now().toString(36)}-${++commandSeq}`, matchId: this.draft.matchId, playerId } as GameCommand;
  }

  private showError(code: string): void {
    this.error = t(`error.${code}`, { limit: this.draft.ruleset.handLimit });
    play("error");
  }

  private notify(events: GameEvent[], state: GameState): void {
    for (const fn of this.listeners) fn(events, state);
  }

  /** Append formatted events; returns the ids of the new entries. */
  private appendLog(events: GameEvent[], state: GameState, provisional = false): number[] {
    const entries = formatEvents(events, state, this.map).map((e) => (provisional ? { ...e, provisional } : e));
    if (entries.length) this.log = [...this.log, ...entries].slice(-300);
    for (const e of events) {
      if (e.type === "resource_gained" && (e.reason === "harvest" || e.reason === "starting_resources")) {
        const f: Floater = { id: floaterId++, playerId: e.playerId, text: `+${e.amount}`, resource: e.resource };
        this.floaters = [...this.floaters, f];
        setTimeout(() => {
          if (!this.destroyed) this.floaters = this.floaters.filter((x) => x.id !== f.id);
        }, 1600);
      }
    }
    return entries.map((e) => e.id);
  }

  // ------------------------------------------------------------------ turn flow

  private afterStateChange(events: GameEvent[]): void {
    if (this.destroyed) return;
    const state = this.authoritative;
    const actor = currentActor(state);
    if (this.transport.kind === "local") {
      void this.autosave();
      if (events.some((e) => e.type === "game_won")) {
        recordGame(this.ctx, state, Object.fromEntries(this.seats.map((s) => [s.playerId, s.kind])));
      }
      // Hot-seat privacy curtain between different humans (§56.1).
      const humans = this.seats.filter((s) => s.kind === "human").length;
      if (actor && this.isHuman(actor) && actor !== this.viewerId) {
        if (settings.privacyCurtain && humans >= 2) this.curtainFor = actor;
        else this.viewerId = actor;
      }
      if (actor && !this.isHuman(actor)) this.scheduleAi();
    } else if (events.some((e) => e.type === "turn_started" && e.playerId === this.onlinePlayerId)) {
      void platform.notify(t("app.title"), t("log.turn", { name: state.players[this.onlinePlayerId ?? ""]?.displayName ?? "" }));
    }
  }

  revealForCurtain(): void {
    if (!this.curtainFor) return;
    this.viewerId = this.curtainFor;
    this.curtainFor = null;
  }

  private scheduleAi(): void {
    if (this.aiTimer) return;
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      void this.runAiStep();
    }, aiDelayMs());
  }

  private async runAiStep(): Promise<void> {
    if (this.destroyed || this.busy) return;
    const state = this.authoritative;
    const actor = currentActor(state);
    if (!actor || this.isHuman(actor)) return;
    const seat = this.seat(actor);
    let intent = chooseAction(this.engine, state, actor, { level: seat?.aiLevel ?? "normal", rng: this.aiRng });
    if (!intent) return;
    devlog("ai", `${seat?.displayName ?? actor} (${seat?.aiLevel ?? "normal"}) chose ${intent.type}`, intent);
    let command = this.envelope(actor, intent);
    let r = this.engine.applyCommand(state, command);
    if (!r.accepted) {
      // Never let a bad AI choice stall the game: fall back to advancing.
      intent = state.phase === "main" ? { type: "end_main_phase" } : state.phase === "banner_assignment" ? { type: "assign_banners", assignments: {} } : { type: "end_turn" };
      command = this.envelope(actor, intent);
      r = this.engine.applyCommand(state, command);
      if (!r.accepted) return;
    }
    this.draft = r.newState as GameState;
    await this.flush([command]);
  }

  // ------------------------------------------------------------------ persistence

  toSaveFile(): SaveFile {
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      rulesetVersion: this.authoritative.rulesetVersion,
      savedAt: new Date().toISOString(),
      mapId: this.mapId,
      seats: this.seats,
      initialState: this.initialState,
      state: this.authoritative,
      commandHistory: this.commandHistory,
    };
  }

  get history(): readonly GameCommand[] {
    return this.commandHistory;
  }

  private async autosave(): Promise<void> {
    if (this.transport.kind !== "local") return;
    try {
      await platform.save("autosave", t("app.title"), this.toSaveFile());
    } catch {
      // Saving is best-effort (private browsing may block IndexedDB).
    }
  }

  destroy(): void {
    this.destroyed = true;
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.transport.close?.();
  }

  private localTransport(): Transport {
    return {
      kind: "local",
      submit: async (commands) => {
        const r = this.engine.applyBatch(this.authoritative, commands);
        if (!r.accepted || !r.newState) return { ok: false, code: r.error?.code ?? "INVALID_COMMAND" };
        return { ok: true, state: r.newState, events: r.events };
      },
    };
  }

  /** Development-only debug commands (§100). */
  debug(command: Parameters<RulesEngine["applyDebugCommand"]>[1]): void {
    if (this.transport.kind !== "local") return;
    const r = this.engine.applyDebugCommand(this.authoritative, command);
    if (r.newState) {
      this.authoritative = r.newState;
      this.draft = r.newState;
      this.buffered = [];
      this.undoStack = [];
    }
  }
}

export { RULESET_VERSION };
