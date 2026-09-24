// Online client (spec §58–60): HTTP for commands, WebSocket for pushes, with
// automatic reconnect. The server URL is configurable so the Tauri app and a
// statically hosted web build can talk to any server.

import type {
  CreateMatchRequest,
  CreateMatchResponse,
  GuestSessionResponse,
  JoinMatchResponse,
  MatchView,
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
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    return data;
  }

  async ensureGuest(displayName: string): Promise<void> {
    this.displayName = displayName;
    if (this.token) {
      try {
        await this.call("/api/me");
        this.persist();
        return;
      } catch {
        this.token = null;
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
  submit(matchId: string, expectedRevision: number, commands: GameCommand[]): Promise<SubmitCommandsResponse> {
    return this.call(`/api/matches/${encodeURIComponent(matchId)}/commands`, { matchId, expectedRevision, commands });
  }

  /** Subscribe to a match; reconnects with backoff until `close()`. */
  subscribe(matchId: string, onUpdate: (match: MatchView, events: GameEvent[]) => void, onStatus: (connected: boolean) => void): () => void {
    let ws: WebSocket | null = null;
    let closed = false;
    let delay = 500;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      if (closed || !this.token) return;
      const url = this.serverUrl.replace(/^http/, "ws").replace(/\/$/, "") + `/api/ws?token=${encodeURIComponent(this.token)}`;
      ws = new WebSocket(url);
      ws.onopen = () => {
        delay = 500;
        onStatus(true);
        ws?.send(JSON.stringify({ type: "subscribe", matchId }));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as ServerMessage;
        if (msg.type === "match_update" && msg.match.matchId === matchId) onUpdate(msg.match, msg.events);
      };
      ws.onclose = () => {
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
