// Runs AI decisions in a module Web Worker so a slow decision never freezes
// the board, animations or input. Where workers are unavailable (tests,
// unusual webviews) or the worker fails to start, decisions run in-thread
// through the same pure function, so results are identical either way.

import { decideAi, type AiDecision, type AiRequest } from "./aiDecide.js";

export interface AiWorkerRequest {
  id: number;
  req: AiRequest;
}

export type AiWorkerResponse = { id: number; ok: true; decision: AiDecision } | { id: number; ok: false; message: string };

/** The parts of `Worker` the client uses, so tests can supply a stand-in. */
export interface AiWorkerLike {
  postMessage(message: AiWorkerRequest): void;
  addEventListener(type: "message" | "messageerror" | "error", listener: (e: Event) => void): void;
  terminate(): void;
}

export enum AiRuntime {
  Worker = "worker",
  Inline = "inline",
}

/**
 * How long one decision may take in the worker before it counts as hung.
 * Far above the slowest measured decision (under a second on a throttled
 * phone), so it only trips on a runaway search or a silently dead worker.
 */
const AI_DECISION_TIMEOUT_MS = 15_000;

export function spawnAiWorker(): AiWorkerLike | null {
  if (typeof Worker === "undefined") return null;
  return new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module", name: "ai" });
}

interface Pending {
  req: AiRequest;
  resolve: (d: AiDecision) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class AiClient {
  private worker: AiWorkerLike | null = null;
  private started = false;
  private broken = false;
  /** The current worker has answered at least once, so it did load. */
  private answered = false;
  private disposed = false;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(
    private readonly spawn: () => AiWorkerLike | null = spawnAiWorker,
    private readonly timeoutMs = AI_DECISION_TIMEOUT_MS,
  ) {}

  get runtime(): AiRuntime {
    return this.worker && !this.broken ? AiRuntime.Worker : AiRuntime.Inline;
  }

  /** Decide one AI move. `req.state` must be plain data (not a Svelte proxy). */
  choose(req: AiRequest): Promise<AiDecision> {
    if (this.disposed) return Promise.reject(new Error("AI client disposed"));
    const worker = this.ensureWorker();
    if (!worker) return this.inline(req);
    const id = this.nextId++;
    return new Promise<AiDecision>((resolve, reject) => {
      const timer = setTimeout(() => this.hang(), this.timeoutMs);
      this.pending.set(id, { req, resolve, reject, timer });
      try {
        worker.postMessage({ id, req });
      } catch (err) {
        // A request that cannot be cloned would fail the same way next time,
        // so only this one runs in-thread.
        clearTimeout(timer);
        this.pending.delete(id);
        console.warn("AI worker could not take the request; deciding in-thread", err);
        this.inline(req).then(resolve, reject);
      }
    });
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.takePending()) p.reject(new Error("AI client disposed"));
  }

  private ensureWorker(): AiWorkerLike | null {
    if (this.broken) return null;
    if (this.started) return this.worker;
    this.started = true;
    this.answered = false;
    try {
      this.worker = this.spawn();
    } catch (err) {
      console.warn("AI worker unavailable; deciding in-thread", err);
      this.worker = null;
    }
    const worker = this.worker;
    if (!worker) return null;
    // Events from a worker that was already replaced (see hang) are ignored.
    const current = () => this.worker === worker;
    worker.addEventListener("message", (e) => current() && this.settle((e as MessageEvent<AiWorkerResponse>).data));
    worker.addEventListener("messageerror", () => current() && this.fail("unreadable reply"));
    worker.addEventListener("error", (e) => current() && this.fail((e as ErrorEvent).message || "failed to start"));
    return worker;
  }

  private settle(res: AiWorkerResponse): void {
    const p = this.pending.get(res.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(res.id);
    this.answered = true;
    if (res.ok) p.resolve(res.decision);
    else p.reject(new Error(res.message));
  }

  /**
   * The worker itself broke (it failed to load, or crashed). Recover by
   * deciding in-thread from now on, including the requests in flight, since
   * a stuck AI would stall the game.
   */
  private fail(reason: string): void {
    if (this.broken) return;
    console.warn(`AI worker failed (${reason}); deciding in-thread`);
    this.broken = true;
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.takePending()) this.inline(p.req).then(p.resolve, p.reject);
  }

  /**
   * The worker did not answer in time. One that never answered at all most
   * likely failed to load without an error event, so it is treated as
   * broken. One that did answer before is stuck on this decision: its
   * requests fail (the session falls back to a progression move and says
   * so) and the next request starts a fresh worker, since deciding in-thread
   * could freeze the page the same way.
   */
  private hang(): void {
    if (!this.answered) return this.fail(`no answer within ${this.timeoutMs} ms`);
    console.warn(`AI worker did not answer within ${this.timeoutMs} ms; restarting it`);
    this.worker?.terminate();
    this.worker = null;
    this.started = false;
    for (const p of this.takePending()) p.reject(new Error("AI worker did not answer in time"));
  }

  private takePending(): Pending[] {
    const all = [...this.pending.values()];
    for (const p of all) clearTimeout(p.timer);
    this.pending.clear();
    return all;
  }

  private inline(req: AiRequest): Promise<AiDecision> {
    return new Promise((resolve) => resolve(decideAi(req)));
  }
}
