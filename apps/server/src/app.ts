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
import { extname, join, normalize, resolve } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { isSubmitCommandsRequest, type ClientMessage, type ServerMessage } from "@manors-menaces/protocol";
import { redactEvent } from "@manors-menaces/rules";
import { HttpError, MatchService } from "./service.js";
import { Store } from "./store.js";

export interface AppOptions {
  dbPath?: string;
  webDist?: string | null;
  corsOrigin?: string;
  aiDelayMs?: number;
  /** Requests per second per client, with a burst of 5× (default 8/s). */
  rateLimitPerSecond?: number;
}

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

export function createApp(opts: AppOptions = {}): { server: Server; service: MatchService; store: Store; close: () => Promise<void> } {
  const store = new Store(opts.dbPath ?? ":memory:");
  const service = new MatchService(store, { aiDelayMs: opts.aiDelayMs ?? 700 });
  const cors = opts.corsOrigin ?? "*";
  const webDist = opts.webDist && existsSync(opts.webDist) ? resolve(opts.webDist) : null;

  // Simple token-bucket rate limit per client (spec §72 hardening).
  const buckets = new Map<string, { tokens: number; at: number }>();
  const rate = opts.rateLimitPerSecond ?? 8;
  const allow = (key: string): boolean => {
    const now = Date.now();
    const b = buckets.get(key) ?? { tokens: rate * 5, at: now };
    b.tokens = Math.min(rate * 5, b.tokens + ((now - b.at) / 1000) * rate);
    b.at = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    buckets.set(key, b);
    return true;
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

  const bearer = (req: IncomingMessage): string | null => {
    const h = req.headers.authorization;
    return h?.startsWith("Bearer ") ? h.slice(7) : null;
  };

  const serveStatic = (req: IncomingMessage, res: ServerResponse): void => {
    if (!webDist) return send(res, 404, { error: "not found" });
    const url = new URL(req.url ?? "/", "http://x");
    let path = normalize(join(webDist, decodeURIComponent(url.pathname)));
    if (!path.startsWith(webDist)) return send(res, 403, { error: "forbidden" });
    if (!existsSync(path) || statSync(path).isDirectory()) path = join(webDist, "index.html");
    res.writeHead(200, {
      "content-type": MIME[extname(path)] ?? "application/octet-stream",
      "cache-control": path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
    });
    createReadStream(path).pipe(res);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (!url.pathname.startsWith("/api/")) return serveStatic(req, res);
    const clientKey = bearer(req) ?? req.socket.remoteAddress ?? "?";
    if (!allow(clientKey)) return send(res, 429, { error: "slow down" });
    try {
      const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
      if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true });
      if (req.method === "POST" && url.pathname === "/api/guest") {
        const body = (await readJson(req)) as { displayName?: unknown };
        return send(res, 200, service.createGuest(body.displayName));
      }
      const user = service.authenticate(bearer(req));
      if (req.method === "GET" && url.pathname === "/api/me") return send(res, 200, { userId: user.id, displayName: user.display_name });
      if (url.pathname === "/api/matches" && req.method === "GET") return send(res, 200, service.listMatches(user));
      if (url.pathname === "/api/matches" && req.method === "POST") return send(res, 200, service.createMatch(user, (await readJson(req)) as never));
      if (url.pathname === "/api/matches/join" && req.method === "POST") {
        const body = (await readJson(req)) as { inviteCode?: unknown; displayName?: unknown };
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
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 500, { error: "internal error" });
    }
  });

  // ------------------------------------------------------------------ WebSocket push
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16_000 });
  const subs = new Map<WebSocket, { userId: string; matches: Set<string> }>();
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/api/ws") return socket.destroy();
    let user;
    try {
      user = service.authenticate(url.searchParams.get("token"));
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      subs.set(ws, { userId: user.id, matches: new Set() });
      const hello: ServerMessage = { type: "hello", userId: user.id };
      ws.send(JSON.stringify(hello));
      ws.on("message", (raw) => {
        let msg: ClientMessage;
        try {
          msg = JSON.parse(String(raw)) as ClientMessage;
        } catch {
          return;
        }
        const sub = subs.get(ws);
        if (!sub) return;
        if (msg.type === "subscribe" && typeof msg.matchId === "string" && service.memberPlayerId(msg.matchId, sub.userId)) {
          sub.matches.add(msg.matchId);
          pushTo(ws, sub.userId, msg.matchId, []);
        } else if (msg.type === "unsubscribe") sub.matches.delete(msg.matchId);
        else if (msg.type === "ping") ws.send(JSON.stringify({ type: "hello", userId: sub.userId } satisfies ServerMessage));
      });
      ws.on("close", () => subs.delete(ws));
    });
  });

  const pushTo = (ws: WebSocket, userId: string, matchId: string, events: Parameters<typeof redactEvent>[0][]): void => {
    try {
      const user = { id: userId, display_name: "", token_hash: "", created_at: "" };
      const match = service.view(matchId, user);
      const viewer = match.youAre;
      const msg: ServerMessage = { type: "match_update", match, events: events.map((e) => redactEvent(e, viewer)) };
      ws.send(JSON.stringify(msg));
    } catch {
      // Not a member any more, or the socket closed.
    }
  };
  service.onMatchUpdate((matchId, events) => {
    for (const [ws, sub] of subs) if (sub.matches.has(matchId)) pushTo(ws, sub.userId, matchId, events);
  });

  return {
    server,
    service,
    store,
    close: () =>
      new Promise((done) => {
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
