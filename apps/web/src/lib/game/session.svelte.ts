// Client-side game session (spec §45). Holds the authoritative state, a draft
// of undoable actions (§32.1), UI-facing log/feedback, AI scheduling and the
// hot-seat privacy curtain. Rules decisions are delegated to the engine.

import { SAVE_SCHEMA_VERSION, type SaveFile, type SeatConfig } from "@manors-menaces/protocol";
import {
  RULESET_VERSION,
  UNDO_SAFE_COMMANDS,
  seedRng,
  type CommandIntent,
  type GameCommand,
  type GameEvent,
  type GameState,
  type PlayerId,
  type RngState,
  type RulesEngine,
  type RulesetConfig,
} from "@manors-menaces/rules";
import { playForEvents, play } from "../audio/sfx.js";
import { t } from "../i18n.js";
import { platform } from "../platform/adapter.js";
import { animationScale, settings } from "../stores/settings.svelte.js";
import { AiClient } from "./aiClient.js";
import { aiPaceDelayMs, aiStepPace, resolveAiStep, type AiStep } from "./aiStep.js";
import { engineFor, mapFor } from "./engine.js";
import { formatEvents, noticeEntry, rebuildLog, type LogEntry } from "./log.js";
import { initialView, nextView, privacyMode, revealView, type PrivacyMode, type PrivacyView } from "./privacy.js";
import { autosavesToPrune, describeSave, exportFileName, manualSaveId, newAutosaveId, replayPending, saveLabel } from "./saves.js";
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
  /** Keep an autosave of this match (default true; the tutorial opts out). */
  autosave?: boolean;
}

/** Coalesces bursts of changes (an AI turn, several builds) into one write. */
const AUTOSAVE_DELAY_MS = 250;

let floaterId = 1;
let commandSeq = 0;

/** How long a stuck AI seat waits before trying again (as on the server). */
const AI_STUCK_RETRY_MS = 5000;
/** How long an AI fallback notice stays up at least, so players can read it. */
const AI_NOTICE_MIN_MS = 4000;

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
  // instead of deep proxies (15 to 130 times faster) and the state can be
  // posted to the AI worker as is. Always replace these, never mutate them.
  authoritative: GameState = $state.raw() as GameState;
  draft: GameState = $state.raw() as GameState;
  buffered: GameCommand[] = $state.raw([]);
  log: LogEntry[] = $state.raw([]);
  floaters: Floater[] = $state.raw([]);
  error: string | null = $state(null);
  busy = $state(false);
  /** Player whose private information (hand) the UI shows; see privacy.ts. */
  viewerId: PlayerId | null = $state(null);
  /** Hot-seat: waiting for this player to take the device. */
  curtainFor: PlayerId | null = $state(null);
  /** Online: which seats currently have a live connection. */
  presence: Record<PlayerId, boolean> = $state.raw({});
  /** Online: this client's seat. */
  readonly onlinePlayerId: PlayerId | null;
  /** The last autosave failed (e.g. storage blocked); the UI offers Export instead. */
  autosaveFailed = $state(false);

  private commandHistory: GameCommand[] = [];
  private undoStack: { state: GameState; logIds: number[] }[] = [];
  private aiTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly ai = new AiClient();
  /** The AI RNG, carried from one decision to the next (§30). */
  private aiRngState: RngState;
  /** An AI decision is being made or paced; at most one runs at a time. */
  private aiInFlight = false;
  /** The last AI problem reported, so repeats in the same turn stay quiet. */
  private aiProblemKey = "";
  /** The AI problem shown as `error`, if any (the Chronicle keeps the record). */
  private aiNotice: { text: string; stuck: boolean; shownAt: number } | null = null;
  private destroyed = false;
  private listeners = new Set<(events: GameEvent[], state: GameState) => void>();
  private readonly autosaveEnabled: boolean;
  /** This line of play's autosave row (see saves.ts). */
  private readonly autosaveSlot: string;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Autosave writes run one after another, so an older snapshot never lands last. */
  private autosaveQueue: Promise<void> = Promise.resolve();
  private autosavesPruned = false;

  constructor(opts: {
    mapId: string;
    seats: SeatConfig[];
    initialState: GameState;
    state: GameState;
    history?: GameCommand[];
    /** The Chronicle so far, e.g. rebuilt from a save's history. */
    log?: LogEntry[];
    /** Undoable actions of the turn in progress, from a save (see SaveFile). */
    pending?: GameCommand[];
    transport?: Transport;
    onlinePlayerId?: PlayerId | null;
    autosave?: boolean;
    /** Keep writing this autosave slot (resuming it); default: a new slot. */
    autosaveSlot?: string;
    /** Opened from a stored save: nothing to autosave until play changes it. */
    fromSave?: boolean;
  }) {
    this.engine = engineFor(opts.mapId);
    this.mapId = opts.mapId;
    this.seats = opts.seats;
    this.initialState = opts.initialState;
    this.commandHistory = [...(opts.history ?? [])];
    this.onlinePlayerId = opts.onlinePlayerId ?? null;
    this.transport = opts.transport ?? this.localTransport();
    this.autosaveEnabled = this.transport.kind === "local" && opts.autosave !== false;
    this.autosaveSlot = opts.autosaveSlot ?? newAutosaveId(opts.state.matchId);
    this.authoritative = opts.state;
    this.draft = opts.state;
    this.log = (opts.log ?? []).slice(-300);
    for (const step of replayPending(this.engine, opts.state, opts.pending ?? [])) {
      this.undoStack.push({ state: step.before, logIds: this.appendLog(step.events, step.after, true) });
      // `buffered` is $state.raw: replace it, never mutate it.
      this.buffered = [...this.buffered, step.command];
      this.draft = step.after;
    }
    this.aiRngState = seedRng(`${opts.state.matchId}:ai:${opts.state.revision}`);
    this.viewerId = this.onlinePlayerId ?? initialView(this.privacyMode(), this.firstHuman()).viewerId;
    this.afterStateChange([]);
    // Writing an unchanged save back would let merely opening an older
    // position replace newer progress; the first change writes it instead.
    if (opts.fromSave) this.cancelScheduledAutosave();
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
    return new GameSession({ mapId, seats: opts.seats, initialState, state: initialState, ...(opts.autosave === false ? { autosave: false } : {}) });
  }

  /**
   * Open a stored save. Pass `autosaveSlot` when resuming an autosave so play
   * continues in that row; otherwise the game autosaves to a new row.
   */
  static fromSave(save: SaveFile, opts: { autosave?: boolean; autosaveSlot?: string } = {}): GameSession {
    // The Chronicle is not saved; rebuild it from the history. It goes in
    // before the replayed pending actions so entry ids stay in log order.
    const { entries } = rebuildLog(engineFor(save.mapId), mapFor(save.mapId), save.initialState, save.commandHistory, save.state);
    return new GameSession({
      mapId: save.mapId,
      seats: save.seats,
      initialState: save.initialState,
      state: save.state,
      history: save.commandHistory,
      log: entries,
      pending: save.pendingCommands ?? [],
      fromSave: true,
      ...opts,
    });
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

  /** Local games only: read each time, as the curtain setting can change mid-game. */
  private privacyMode(): PrivacyMode {
    return privacyMode(this.seats.filter((s) => s.kind === "human").length, settings.privacyCurtain);
  }

  private setView(view: PrivacyView): void {
    this.viewerId = view.viewerId;
    this.curtainFor = view.curtainFor;
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
    if (this.transport.kind === "online" && !UNDO_SAFE_COMMANDS.has(command.type)) {
      // Online, the draft is a redacted view (§105): it cannot know whether a
      // hidden hand opens a reaction window, what a draw yields, or what the
      // deck holds for a Prophecy. The server is authoritative (§59), so
      // locking commands go straight to it and the draft waits for its answer.
      devlog("command", command.type, { command, deferredToServer: true });
      this.error = null;
      return this.flush([...this.buffered, command]);
    }
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
      this.scheduleAutosave();
      return true;
    }
    // Locking commands are logged from the authoritative result.
    this.draft = r.newState;
    return this.flush([...this.buffered, command]);
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
    this.scheduleAutosave();
  }

  private inFlight = 0;

  /** Submits the batch; resolves to whether the server accepted it. */
  private async flush(batch: GameCommand[]): Promise<boolean> {
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
        return false;
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
      return true;
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
      // A finished game has nothing to continue: drop its autosave so
      // Continue never reopens a Victory screen.
      if (state.status === "finished") this.discardAutosave();
      else this.scheduleAutosave();
      if (events.some((e) => e.type === "game_won")) {
        recordGame(this.ctx, state, Object.fromEntries(this.seats.map((s) => [s.playerId, s.kind])));
      }
      // Hot-seat privacy curtain between different humans (§56.1).
      const view = { viewerId: this.viewerId, curtainFor: this.curtainFor };
      this.setView(nextView(this.privacyMode(), view, actor, this.isHuman(actor), state.activePlayerId));
      if (actor && !this.isHuman(actor)) this.scheduleAi();
      else if (actor) this.expireAiNotice();
    } else if (events.some((e) => e.type === "turn_started" && e.playerId === this.onlinePlayerId)) {
      void platform.notify(t("app.title"), t("log.turn", { name: state.players[this.onlinePlayerId ?? ""]?.displayName ?? "" }));
    }
  }

  revealForCurtain(): void {
    this.setView(revealView({ viewerId: this.viewerId, curtainFor: this.curtainFor }));
  }

  private scheduleAi(delayMs = 0): void {
    if (this.aiTimer || this.aiInFlight) return;
    // Deferred so the batch that led here has fully settled (busy is clear).
    this.aiTimer = setTimeout(() => {
      this.aiTimer = null;
      void this.runAiStep();
    }, delayMs);
  }

  private async runAiStep(): Promise<void> {
    if (this.destroyed || this.busy || this.aiInFlight) return;
    const state = this.authoritative;
    const actor = currentActor(state);
    if (!actor || this.isHuman(actor)) return;
    this.aiInFlight = true;
    let step: AiStep | null;
    try {
      step = await this.prepareAiStep(state, actor);
    } finally {
      this.aiInFlight = false;
    }
    if (this.destroyed) return;
    // The game moved on while the AI was thinking (e.g. a debug command).
    if (this.authoritative !== state || this.busy) return this.scheduleAi();
    if (!step) return this.scheduleAi(AI_STUCK_RETRY_MS);
    if (!step.fellBack || this.aiNotice?.stuck) this.expireAiNotice();
    this.draft = step.newState;
    await this.flush([step.command]);
  }

  /**
   * Decide off the UI thread, then hold the move for the beat it deserves:
   * steps that change nothing visible go straight through, visible ones wait
   * (counting the time spent thinking) so players can follow them. Null if
   * the seat is stuck or the game moved on meanwhile.
   */
  private async prepareAiStep(state: GameState, actor: PlayerId): Promise<AiStep | null> {
    const seat = this.seat(actor);
    const level = seat?.aiLevel ?? "normal";
    const started = performance.now();
    let intent: CommandIntent | null = null;
    let failure: unknown = null;
    try {
      const decision = await this.ai.choose({ mapId: this.mapId, state, playerId: actor, level, rngState: this.aiRngState });
      this.aiRngState = decision.rngState;
      intent = decision.intent;
    } catch (err) {
      failure = err;
    }
    if (this.destroyed || this.authoritative !== state) return null;

    // Never let a failed or bad AI choice stall the game: fall back to the
    // same progression moves as the server, and say so.
    const step = resolveAiStep(this.engine, state, actor, intent, (i) => this.envelope(actor, i));
    if (!step || step.fellBack) this.reportAiProblem(state, actor, step, failure ?? intent);
    if (!step) return null;
    devlog("ai", `${seat?.displayName ?? actor} (${level}) chose ${step.command.type}`, step.command);

    const wait = aiPaceDelayMs(aiStepPace(step), animationScale()) - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return step;
  }

  /** Show an AI failure as an error and in the Chronicle, once per seat and turn. */
  private reportAiProblem(state: GameState, actor: PlayerId, step: AiStep | null, cause: unknown): void {
    console.error(`AI seat ${actor} ${step ? `fell back to ${step.command.type}` : "has no legal move"} at revision ${state.revision}`, cause);
    const key = `${state.turnNumber}:${actor}:${step ? "fallback" : "stuck"}`;
    if (this.aiProblemKey === key) return;
    this.aiProblemKey = key;
    const name = state.players[actor]?.displayName ?? actor;
    const text = t(step ? "error.AI_FALLBACK" : "error.AI_STUCK", { name });
    this.aiNotice = { text, stuck: !step, shownAt: performance.now() };
    this.error = text;
    this.log = [...this.log, noticeEntry(text, actor)].slice(-300);
  }

  /**
   * Take down the AI notice once play has moved on: a stuck notice as soon as
   * the seat moves, a fallback notice once it has been up long enough to read.
   * Otherwise the human's next action clears it, like any error.
   */
  private expireAiNotice(): void {
    const notice = this.aiNotice;
    if (!notice) return;
    if (!notice.stuck && performance.now() - notice.shownAt < AI_NOTICE_MIN_MS) return;
    this.aiNotice = null;
    if (this.error === notice.text) this.error = null;
  }

  // ------------------------------------------------------------------ persistence

  /**
   * A snapshot of exactly what is on screen: the committed state plus this
   * turn's undoable actions, which loading re-applies (still undoable).
   */
  toSaveFile(): SaveFile {
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      rulesetVersion: this.authoritative.rulesetVersion,
      savedAt: new Date().toISOString(),
      mapId: this.mapId,
      seats: this.seats,
      initialState: this.initialState,
      state: this.authoritative,
      // Copied: the live history grows in place as batches commit.
      commandHistory: [...this.commandHistory],
      ...(this.buffered.length ? { pendingCommands: [...this.buffered] } : {}),
    };
  }

  get history(): readonly GameCommand[] {
    return this.commandHistory;
  }

  /** Store a manual save. Rejects if it could not be stored. */
  async save(): Promise<void> {
    const data = this.toSaveFile();
    await platform.save(manualSaveId(data), saveLabel(describeSave(data)), data);
    // Continue should resume at least as far as the newest manual save.
    await this.flushAutosave();
  }

  /** Export the save as a file. Resolves false if the player cancelled. */
  exportSave(): Promise<boolean> {
    const data = this.toSaveFile();
    return platform.exportFile(exportFileName(data), JSON.stringify(data, null, 2));
  }

  private scheduleAutosave(): void {
    if (!this.autosaveEnabled || this.destroyed) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.flushAutosave(), AUTOSAVE_DELAY_MS);
  }

  /**
   * Write a scheduled autosave now (leaving the game, page hidden), or retry
   * one that failed. Resolves when every queued autosave write has settled;
   * `autosaveFailed` then tells whether the game is stored.
   */
  flushAutosave(): Promise<void> {
    const retry = this.autosaveFailed && this.authoritative.status !== "finished";
    if (this.autosaveTimer || retry) {
      this.cancelScheduledAutosave();
      const data = this.toSaveFile();
      this.enqueueAutosave(async () => {
        await platform.save(this.autosaveSlot, saveLabel(describeSave(data)), data);
        // Pruning is housekeeping: the game itself is stored at this point.
        if (!this.autosavesPruned) await this.pruneAutosaves().catch((e: unknown) => console.warn("Pruning autosaves failed", e));
      });
    }
    return this.autosaveQueue;
  }

  private cancelScheduledAutosave(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
  }

  private discardAutosave(): void {
    if (!this.autosaveEnabled) return;
    this.cancelScheduledAutosave();
    const id = this.autosaveSlot;
    this.enqueueAutosave(() => platform.remove(id));
  }

  /** Autosaves are bounded: once per session, delete all but the newest (and this game's). */
  private async pruneAutosaves(): Promise<void> {
    this.autosavesPruned = true;
    for (const id of autosavesToPrune(await platform.listSaves(), this.autosaveSlot)) await platform.remove(id);
  }

  private enqueueAutosave(write: () => Promise<void>): void {
    this.autosaveQueue = this.autosaveQueue.then(write).then(
      () => {
        this.autosaveFailed = false;
      },
      (e: unknown) => {
        // Not fatal to play (private browsing may block IndexedDB), but never
        // silent: the game menu warns and offers Export instead.
        this.autosaveFailed = true;
        console.warn("Autosave failed", e);
      },
    );
  }

  destroy(): void {
    void this.flushAutosave();
    this.destroyed = true;
    if (this.aiTimer) clearTimeout(this.aiTimer);
    this.ai.dispose();
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
