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

export function spawnAiWorker(): AiWorkerLike | null {
  if (typeof Worker === "undefined") return null;
  return new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module", name: "ai" });
}

interface Pending {
  req: AiRequest;
  resolve: (d: AiDecision) => void;
  reject: (e: Error) => void;
}

export class AiClient {
  private worker: AiWorkerLike | null = null;
  private started = false;
  private broken = false;
  private disposed = false;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(private readonly spawn: () => AiWorkerLike | null = spawnAiWorker) {}

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
      this.pending.set(id, { req, resolve, reject });
      try {
        worker.postMessage({ id, req });
      } catch (err) {
        // A request that cannot be cloned would fail the same way next time,
        // so only this one runs in-thread.
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
    for (const p of this.pending.values()) p.reject(new Error("AI client disposed"));
    this.pending.clear();
  }

  private ensureWorker(): AiWorkerLike | null {
    if (this.broken) return null;
    if (this.started) return this.worker;
    this.started = true;
    try {
      this.worker = this.spawn();
    } catch (err) {
      console.warn("AI worker unavailable; deciding in-thread", err);
      this.worker = null;
    }
    if (!this.worker) return null;
    this.worker.addEventListener("message", (e) => this.settle((e as MessageEvent<AiWorkerResponse>).data));
    this.worker.addEventListener("messageerror", () => this.fail("unreadable reply"));
    this.worker.addEventListener("error", (e) => this.fail((e as ErrorEvent).message || "failed to start"));
    return this.worker;
  }

  private settle(res: AiWorkerResponse): void {
    const p = this.pending.get(res.id);
    if (!p) return;
    this.pending.delete(res.id);
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
    const inFlight = [...this.pending.values()];
    this.pending.clear();
    for (const p of inFlight) this.inline(p.req).then(p.resolve, p.reject);
  }

  private inline(req: AiRequest): Promise<AiDecision> {
    return new Promise((resolve) => resolve(decideAi(req)));
  }
}
