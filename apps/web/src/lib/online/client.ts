// Online client (spec §58–60): HTTP for commands, WebSocket for pushes, with
// automatic reconnect. The server URL is configurable so the Tauri app and a
// statically hosted web build can talk to any server.

import type {
  ApiErrorBody,
  ApiErrorCode,
  ClientMessage,
  CreateMatchRequest,
  CreateMatchResponse,
  GuestSessionResponse,
  JoinMatchResponse,
  MatchHistoryResponse,
  MatchNotice,
  MatchView,
  PushSubscriptionRequest,
  ServerMessage,
  SubmitCommandsResponse,
} from "@manors-menaces/protocol";
import type { GameCommand, GameEvent, GameState } from "@manors-menaces/rules";
import type { Transport } from "../game/session.svelte.js";

const KEY = "mm.online.v1";

interface Saved {
  serverUrl: string;
  token: string | null;
  userId: string | null;
  displayName: string;
}

function defaultServer(): string {
  const env = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  if (typeof location !== "undefined" && location.protocol.startsWith("http") && location.port !== "5173") return location.origin;
  return "http://localhost:8787";
}

/** An HTTP error from the server, with its machine-readable code if it sent one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: ApiErrorCode,
  ) {
    super(message);
  }

  /** The server rejected the session token; only a new guest session helps. */
  get sessionInvalid(): boolean {
    return this.status === 401;
  }
}

export class OnlineClient {
  serverUrl: string;
  token: string | null;
  userId: string | null;
  displayName: string;

  constructor() {
    let saved: Partial<Saved> = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Saved>;
    } catch {
      // ignore
    }
    this.serverUrl = saved.serverUrl ?? defaultServer();
    this.token = saved.token ?? null;
    this.userId = saved.userId ?? null;
    this.displayName = saved.displayName ?? "";
  }

  persist(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ serverUrl: this.serverUrl, token: this.token, userId: this.userId, displayName: this.displayName } satisfies Saved));
    } catch {
      // ignore
    }
  }

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.serverUrl.replace(/\/$/, "") + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = (await res.json().catch(() => ({}))) as T & Partial<ApiErrorBody>;
    if (!res.ok) {
      // A rejected token never becomes valid again (the server lost its
      // database, or this is another server): forget it rather than
      // retrying it on every visit.
      if (res.status === 401) this.forgetSession();
      throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`, data.code);
    }
    return data;
  }

  private forgetSession(): void {
    this.token = null;
    this.userId = null;
    this.persist();
  }

  async ensureGuest(displayName: string): Promise<void> {
    this.displayName = displayName;
    if (this.token) {
      try {
        await this.call("/api/me");
        this.persist();
        return;
      } catch (e) {
        // Keep the session through network trouble; replace it only once
        // the server has rejected it.
        if (!(e instanceof ApiError && e.sessionInvalid)) throw e;
      }
    }
    const g = await this.call<GuestSessionResponse>("/api/guest", { displayName });
    this.token = g.token;
    this.userId = g.userId;
    this.persist();
  }

  listMatches(): Promise<MatchView[]> {
    return this.call("/api/matches");
  }
  createMatch(req: CreateMatchRequest): Promise<CreateMatchResponse> {
    return this.call("/api/matches", req);
  }
  joinMatch(inviteCode: string, displayName: string): Promise<JoinMatchResponse> {
    return this.call("/api/matches/join", { inviteCode, displayName });
  }
  getMatch(matchId: string): Promise<MatchView> {
    return this.call(`/api/matches/${encodeURIComponent(matchId)}`);
  }
  /** The match with every move's events, for its Chronicle. */
  async history(matchId: string): Promise<MatchHistoryResponse> {
    try {
      return await this.call(`/api/matches/${encodeURIComponent(matchId)}/history`);
    } catch (e) {
      // A server from before the history endpoint: open the match without its
      // Chronicle, which then says so. A missing match is still reported by getMatch.
      if (!(e instanceof ApiError && e.status === 404)) throw e;
      return { match: await this.getMatch(matchId), entries: [], complete: false };
    }
  }
  submit(matchId: string, expectedRevision: number, commands: GameCommand[]): Promise<SubmitCommandsResponse> {
    return this.call(`/api/matches/${encodeURIComponent(matchId)}/commands`, { matchId, expectedRevision, commands });
  }

  /**
   * Subscribe to a match; reconnects with backoff until `close()`. With
   * `since` (the revision on screen), each (re)connection's first update
   * carries the events missed meanwhile.
   */
  subscribe(
    matchId: string,
    onUpdate: (match: MatchView, events: GameEvent[]) => void,
    onStatus: (connected: boolean) => void,
    since?: () => number,
  ): () => void {
    return this.socket(
      (ws) => ws.send(JSON.stringify({ type: "subscribe", matchId, ...(since ? { since: since() } : {}) } satisfies ClientMessage)),
      (msg) => {
        if (msg.type === "match_update" && msg.match.matchId === matchId) onUpdate(msg.match, msg.events);
      },
      onStatus,
    );
  }

  /**
   * Listen for this guest's match notices (spec §85) while the app is open;
   * reconnects with backoff until `close()`. The server sends them to every
   * socket of the guest, so match sockets ignore them and only this one reads them.
   */
  watch(onNotice: (notice: MatchNotice) => void): () => void {
    return this.socket(
      () => {},
      (msg) => {
        if (msg.type === "notice") onNotice(msg.notice);
      },
      () => {},
    );
  }

  /**
   * A WebSocket that reconnects with backoff until the returned function is
   * called. The session token travels in the query string because browsers
   * cannot set WebSocket headers; deploy behind TLS and keep query strings out
   * of access logs.
   */
  private socket(onOpen: (ws: WebSocket) => void, onMessage: (msg: ServerMessage) => void, onStatus: (connected: boolean) => void): () => void {
    let ws: WebSocket | null = null;
    let closed = false;
    let delay = 500;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      if (closed || !this.token) return;
      const url = this.serverUrl.replace(/^http/, "ws").replace(/\/$/, "") + `/api/ws?token=${encodeURIComponent(this.token)}`;
      const socket = new WebSocket(url);
      ws = socket;
      socket.onopen = () => {
        delay = 500;
        onStatus(true);
        onOpen(socket);
      };
      socket.onmessage = (e) => onMessage(JSON.parse(String(e.data)) as ServerMessage);
      socket.onclose = () => {
        onStatus(false);
        if (closed) return;
        timer = setTimeout(open, delay);
        delay = Math.min(delay * 2, 10_000);
      };
    };
    open();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }

  /** The server's VAPID key, for subscribing this browser to Web Push. */
  pushKey(): Promise<{ publicKey: string }> {
    return this.call("/api/push/key");
  }
  pushSubscribe(subscription: PushSubscriptionRequest): Promise<{ ok: true }> {
    return this.call("/api/push/subscribe", subscription);
  }
  pushUnsubscribe(endpoint: string): Promise<{ ok: true }> {
    return this.call("/api/push/unsubscribe", { endpoint });
  }
}

export function onlineTransport(client: OnlineClient, matchId: string, onClose: () => void): Transport {
  return {
    kind: "online",
    async submit(commands, expectedRevision) {
      try {
        const res = await client.submit(matchId, expectedRevision, commands);
        if (res.accepted && res.state) return { ok: true, state: res.state, events: res.events };
        return { ok: false, code: res.error?.code ?? "INVALID_COMMAND", ...(res.state ? { state: res.state as GameState } : {}) };
      } catch {
        return { ok: false, code: "NETWORK" };
      }
    },
    close: onClose,
  };
}
