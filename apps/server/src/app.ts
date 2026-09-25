// HTTP + WebSocket front end for the match service.
//
//   POST /api/guest                    → GuestSessionResponse
//   GET  /api/me
//   GET  /api/matches                  → MatchView[] (your matches)
//   POST /api/matches                  CreateMatchRequest → CreateMatchResponse
//   POST /api/matches/join             JoinMatchRequest → JoinMatchResponse
//   GET  /api/matches/:id              → MatchView (redacted for you)
//   POST /api/matches/:id/commands     SubmitCommandsRequest → SubmitCommandsResponse
//   GET  /api/matches/:id/replay       finished matches only
//   GET  /api/health
//   WS   /api/ws?token=…               subscribe → match_update pushes
// Anything else is served from WEB_DIST (the built web client), if set.

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { isSubmitCommandsRequest, type ApiErrorBody, type ClientMessage, type ServerMessage } from "@manors-menaces/protocol";
import { redactEvent, type GameEvent } from "@manors-menaces/rules";
import { HttpError, MatchService } from "./service.js";
import { Store } from "./store.js";

export interface AppOptions {
  dbPath?: string;
  webDist?: string | null;
  corsOrigin?: string;
  aiDelayMs?: number;
  /** Requests per second per client, with a burst of 5× (default 8/s). */
  rateLimitPerSecond?: number;
  /**
   * Number of reverse proxies in front of the server whose forwarding headers
   * identify the client for rate limiting (default 0: use the socket address).
   */
  trustProxy?: number;
  /** WebSocket ping interval; a socket that misses one ping is dropped (default 25 s). */
  heartbeatMs?: number;
}

// WebSocket limits. A client sends one small frame per match it opens, so
// these leave ample room while stopping a single socket from making the
// server read, redact and send a match view thousands of times a second.
// Commands travel over HTTP (64 KB body cap), never over the socket: the
// largest valid ClientMessage is a subscribe with a server-issued match id
// (`m_` + UUID), 71 bytes.
const WS_MAX_MESSAGE_BYTES = 4_096;
const WS_MESSAGES_PER_SECOND = 5;
const WS_MESSAGE_BURST = 20;
const WS_MAX_SUBSCRIPTIONS = 10;
/** RFC 6455 close code for a peer that breaks the server's usage policy. */
const WS_POLICY_VIOLATION = 1008;
const MAX_SOCKETS_PER_USER = 5;
/** Longest address accepted from a forwarding header (a bracketed IPv6 address fits). */
const MAX_FORWARDED_ADDRESS = 64;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".map": "application/json",
};

/** Allows `rate` actions per second on average, and bursts of up to `burst`. */
class TokenBucket {
  private tokens: number;
  lastUsed = Date.now();

  constructor(
    private readonly rate: number,
    private readonly burst: number,
  ) {
    this.tokens = burst;
  }

  take(now = Date.now()): boolean {
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.lastUsed) / 1000) * this.rate);
    this.lastUsed = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** An address without its port: `[2001:db8::17]:4711` and `192.0.2.60:4711` both carry one. */
function withoutPort(value: string): string {
  if (value.startsWith("[")) return value.slice(1, value.indexOf("]"));
  const parts = value.split(":");
  return parts.length === 2 ? (parts[0] as string) : value; // IPv4 with a port; bare IPv6 has more colons
}

/** Client addresses listed by forwarding headers, nearest proxy last. */
function forwardedChain(req: IncomingMessage): string[] {
  const xff = req.headers["x-forwarded-for"];
  // Some load balancers append the client port, which would give every connection its own bucket.
  if (xff) return String(xff).split(",").map((a) => withoutPort(a.trim()));
  const forwarded = req.headers.forwarded;
  if (!forwarded) return [];
  // RFC 7239: `for=192.0.2.60;proto=http, for="[2001:db8::17]:4711"`.
  return String(forwarded)
    .split(",")
    .map((element) => {
      const pair = element.split(";").find((p) => p.trim().toLowerCase().startsWith("for="));
      return withoutPort((pair?.trim().slice(4) ?? "").replace(/^"|"$/g, ""));
    });
}

/**
 * The address rate limits are keyed on. Behind `trustProxy` proxies it is
 * the entry `trustProxy` places from the right of the forwarding chain: the
 * address the outermost trusted proxy saw. Entries further left come from
 * the client and could be rotated to dodge the limit, so they are ignored.
 */
function clientAddress(req: IncomingMessage, trustProxy: number): string {
  const direct = req.socket.remoteAddress ?? "?";
  if (trustProxy <= 0) return direct;
  const chain = forwardedChain(req);
  const entry = chain[chain.length - trustProxy];
  return entry && entry.length <= MAX_FORWARDED_ADDRESS ? entry : direct;
}

export function createApp(opts: AppOptions = {}): { server: Server; service: MatchService; store: Store; close: () => Promise<void> } {
  const store = new Store(opts.dbPath ?? ":memory:");
  const service = new MatchService(store, { aiDelayMs: opts.aiDelayMs ?? 700 });
  const cors = opts.corsOrigin ?? "*";
  const webDist = opts.webDist && existsSync(opts.webDist) ? resolve(opts.webDist) : null;

  // Simple token-bucket rate limit per client (spec §72 hardening).
  const buckets = new Map<string, TokenBucket>();
  const rate = opts.rateLimitPerSecond ?? 8;
  const trustProxy = opts.trustProxy ?? 0;
  // Keyed by client address (forwarding headers count only when the operator
  // vouches for the proxies that set them, since a client could rotate them);
  // idle buckets are swept so the map stays bounded.
  const sweep = setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [k, b] of buckets) if (b.lastUsed < cutoff) buckets.delete(k);
  }, 30_000);
  sweep.unref();
  const allow = (req: IncomingMessage): boolean => {
    const key = clientAddress(req, trustProxy);
    let bucket = buckets.get(key);
    if (!bucket) buckets.set(key, (bucket = new TokenBucket(rate, rate * 5)));
    return bucket.take();
  };

  const send = (res: ServerResponse, status: number, body: unknown): void => {
    res.writeHead(status, {
      "content-type": "application/json",
      "access-control-allow-origin": cors,
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(body));
  };

  const readJson = (req: IncomingMessage): Promise<unknown> =>
    new Promise((resolveBody, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > 64_000) {
          reject(new HttpError(413, "body too large"));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        if (chunks.length === 0) return resolveBody({});
        try {
          resolveBody(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(new HttpError(400, "invalid JSON"));
        }
      });
      req.on("error", reject);
    });

  const readObject = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
    const body = await readJson(req);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "request body must be a JSON object");
    return body as Record<string, unknown>;
  };

  const bearer = (req: IncomingMessage): string | null => {
    const h = req.headers.authorization;
    return h?.startsWith("Bearer ") ? h.slice(7) : null;
  };

  const serveStatic = (req: IncomingMessage, res: ServerResponse): void => {
    if (!webDist) return send(res, 404, { error: "not found" });
    const url = new URL(req.url ?? "/", "http://x");
    let decoded: string;
    try {
      decoded = decodeURIComponent(url.pathname);
    } catch {
      return send(res, 400, { error: "bad path" });
    }
    let path = normalize(join(webDist, decoded));
    // Must stay inside webDist itself, not merely share its prefix (/app/web vs /app/webevil).
    if (path !== webDist && !path.startsWith(webDist + sep)) return send(res, 403, { error: "forbidden" });
    if (!existsSync(path) || statSync(path).isDirectory()) path = join(webDist, "index.html");
    res.writeHead(200, {
      "content-type": MIME[extname(path)] ?? "application/octet-stream",
      "cache-control": path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    });
    const stream = createReadStream(path);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  };

  const server = createServer(async (req, res) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://x");
    } catch {
      return send(res, 400, { error: "bad url" });
    }
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (!url.pathname.startsWith("/api/")) {
      try {
        return serveStatic(req, res);
      } catch (e) {
        console.error(e);
        return send(res, 500, { error: "internal error" });
      }
    }
    if (!allow(req)) return send(res, 429, { error: "slow down" });
    try {
      const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
      if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true });
      if (req.method === "POST" && url.pathname === "/api/guest") {
        const body = await readObject(req);
        return send(res, 200, service.createGuest(body.displayName));
      }
      const user = service.authenticate(bearer(req));
      if (req.method === "GET" && url.pathname === "/api/me") return send(res, 200, { userId: user.id, displayName: user.display_name });
      if (url.pathname === "/api/matches" && req.method === "GET") return send(res, 200, service.listMatches(user));
      if (url.pathname === "/api/matches" && req.method === "POST") return send(res, 200, service.createMatch(user, (await readObject(req)) as never));
      if (url.pathname === "/api/matches/join" && req.method === "POST") {
        const body = await readObject(req);
        return send(res, 200, service.joinMatch(user, body.inviteCode, body.displayName));
      }
      if (parts[1] === "matches" && parts[2]) {
        const matchId = parts[2];
        if (parts.length === 3 && req.method === "GET") return send(res, 200, service.view(matchId, user));
        if (parts[3] === "commands" && req.method === "POST") {
          const body = await readJson(req);
          if (!isSubmitCommandsRequest(body) || body.matchId !== matchId) throw new HttpError(400, "malformed command batch");
          return send(res, 200, service.submit(user, body));
        }
        if (parts[3] === "replay" && req.method === "GET") {
          const view = service.view(matchId, user);
          if (view.status !== "finished") throw new HttpError(409, "replays are available once the match is finished");
          return send(res, 200, service.replayData(matchId));
        }
      }
      throw new HttpError(404, "not found");
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.code ? { code: e.code } : {}) } satisfies ApiErrorBody);
      console.error(e);
      return send(res, 500, { error: "internal error" });
    }
  });

  // ------------------------------------------------------------------ WebSocket push
  const wss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_MESSAGE_BYTES });
  interface Subscriber {
    userId: string;
    matches: Set<string>;
    messages: TokenBucket;
    /** Cleared on every ping and set again by the pong. */
    alive: boolean;
  }
  const subs = new Map<WebSocket, Subscriber>();
  service.isConnected = (userId) => [...subs.values()].some((s) => s.userId === userId);
  // Tell other members when someone connects or disconnects.
  let closing = false;
  const presenceChanged = (userId: string): void => {
    if (closing) return; // sockets close after the database during shutdown
    try {
      for (const m of service.listMatchIdsForUser(userId)) broadcast(m, []);
    } catch (e) {
      console.error(e);
    }
  };
  // Heartbeat: a half-open connection (say, a phone that lost its network)
  // never fires "close", so it would look online and hold one of the user's
  // socket slots. Drop every socket that did not answer the previous ping.
  const heartbeat = setInterval(() => {
    for (const [ws, sub] of subs) {
      if (!sub.alive) {
        ws.terminate(); // its "close" handler updates presence
        continue;
      }
      sub.alive = false;
      ws.ping();
    }
  }, opts.heartbeatMs ?? 25_000);
  heartbeat.unref();
  server.on("upgrade", (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url ?? "/", "http://x");
    } catch {
      return socket.destroy();
    }
    if (url.pathname !== "/api/ws" || !allow(req)) return socket.destroy();
    let user;
    try {
      user = service.authenticate(url.searchParams.get("token"));
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return socket.destroy();
    }
    if ([...subs.values()].filter((s) => s.userId === user.id).length >= MAX_SOCKETS_PER_USER) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\n\r\n");
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const sub: Subscriber = { userId: user.id, matches: new Set(), messages: new TokenBucket(WS_MESSAGES_PER_SECOND, WS_MESSAGE_BURST), alive: true };
      subs.set(ws, sub);
      presenceChanged(user.id);
      const hello: ServerMessage = { type: "hello", userId: user.id };
      ws.send(JSON.stringify(hello));
      ws.on("pong", () => (sub.alive = true));
      // ws closes the socket itself on protocol errors (1009 for an oversized
      // frame); without a listener the error would also be an uncaught exception.
      ws.on("error", () => {});
      ws.on("message", (raw) => {
        if (ws.readyState !== ws.OPEN) return;
        if (!sub.messages.take()) return ws.close(WS_POLICY_VIOLATION, "too many messages");
        let msg: ClientMessage;
        try {
          msg = JSON.parse(String(raw)) as ClientMessage;
        } catch {
          return;
        }
        if (!msg || typeof msg !== "object" || Array.isArray(msg)) return;
        if (msg.type === "subscribe" && typeof msg.matchId === "string") {
          // Repeats are ignored: the socket already receives every update.
          if (sub.matches.has(msg.matchId) || sub.matches.size >= WS_MAX_SUBSCRIPTIONS) return;
          let member: string | null;
          try {
            member = service.memberPlayerId(msg.matchId, sub.userId);
          } catch (e) {
            // main.ts exits on uncaught exceptions: a failed lookup must not take the server down.
            console.error(e);
            return;
          }
          if (!member) return;
          sub.matches.add(msg.matchId);
          const update = updateFor(sub.userId, msg.matchId, []);
          if (update) ws.send(update);
        } else if (msg.type === "unsubscribe") sub.matches.delete(msg.matchId);
        else if (msg.type === "ping") ws.send(JSON.stringify({ type: "hello", userId: sub.userId } satisfies ServerMessage));
      });
      ws.on("close", () => {
        subs.delete(ws);
        presenceChanged(user.id);
      });
    });
  });

  /** The serialised update for one member, or null if they are not a member any more. */
  const updateFor = (userId: string, matchId: string, events: GameEvent[]): string | null => {
    try {
      const user = { id: userId, display_name: "", token_hash: "", created_at: "" };
      const match = service.view(matchId, user);
      const viewer = match.youAre;
      const msg: ServerMessage = { type: "match_update", match, events: events.map((e) => redactEvent(e, viewer)) };
      return JSON.stringify(msg);
    } catch {
      return null;
    }
  };
  /** Pushes an update to every subscribed socket, building each member's view once. */
  const broadcast = (matchId: string, events: GameEvent[]): void => {
    const perUser = new Map<string, string | null>();
    for (const [ws, sub] of subs) {
      if (!sub.matches.has(matchId)) continue;
      if (!perUser.has(sub.userId)) perUser.set(sub.userId, updateFor(sub.userId, matchId, events));
      const update = perUser.get(sub.userId);
      if (update) ws.send(update);
    }
  };
  service.onMatchUpdate(broadcast);
  // AI turns run on in-memory timers: restart the ones a restart dropped.
  service.resumeAll();

  return {
    server,
    service,
    store,
    close: () =>
      new Promise((done) => {
        closing = true;
        clearInterval(sweep);
        clearInterval(heartbeat);
        service.shutdown();
        for (const ws of subs.keys()) ws.terminate();
        wss.close();
        server.close(() => {
          store.db.close();
          done();
        });
      }),
  };
}
