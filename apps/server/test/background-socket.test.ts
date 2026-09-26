import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { GuestSessionResponse, MatchNotice, MatchView, ServerMessage } from "@manors-menaces/protocol";
import { createApp } from "../src/app.js";

// The Android app keeps one "background" connection while it is closed
// (docs/notifications.md): it hears turn notices like an open app, but must
// not look online to opponents, and must not wake the phone every 25 s.

const HEARTBEAT_MS = 40;
const BACKGROUND_HEARTBEAT_MS = 400;
let app: ReturnType<typeof createApp>;
let base = "";
let pushes: string[] = [];

async function start() {
  pushes = [];
  const fakeFetch = (async (url: string | URL) => {
    pushes.push(String(url));
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  app = createApp({ webDist: null, aiDelayMs: 5, rateLimitPerSecond: 10_000, heartbeatMs: HEARTBEAT_MS, backgroundHeartbeatMs: BACKGROUND_HEARTBEAT_MS, push: { fetch: fakeFetch } });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await app.close();
});

async function api<T>(path: string, token: string | null, body?: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, data: (await res.json()) as T };
}

const guest = async (name: string) => (await api<GuestSessionResponse>("/api/guest", null, { displayName: name })).data;

interface Connection {
  ws: WebSocket;
  messages: ServerMessage[];
  pings: number;
  closed: boolean;
}

async function connect(token: string, mode?: "background", options: WebSocket.ClientOptions = {}): Promise<Connection> {
  const ws = new WebSocket(`${base.replace("http", "ws")}/api/ws?token=${token}${mode ? `&mode=${mode}` : ""}`, options);
  const conn: Connection = { ws, messages: [], pings: 0, closed: false };
  ws.on("message", (raw) => conn.messages.push(JSON.parse(String(raw)) as ServerMessage));
  ws.on("ping", () => conn.pings++);
  ws.on("close", () => (conn.closed = true));
  await new Promise<void>((r) => ws.on("open", () => r()));
  return conn;
}

const noticesIn = (conn: Connection): MatchNotice[] => conn.messages.flatMap((m) => (m.type === "notice" ? [m.notice] : []));
const pendingIn = (conn: Connection): MatchNotice[][] => conn.messages.flatMap((m) => (m.type === "pending_notices" ? [m.notices] : []));

async function waitFor(ok: () => boolean, ms = 3000): Promise<void> {
  for (const end = Date.now() + ms; !ok() && Date.now() < end; ) await new Promise((r) => setTimeout(r, 10));
  if (!ok()) throw new Error(`waitFor: still not true after ${ms} ms`);
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Starts a two-player match; the match start tells the first player to act. */
async function startMatch(alice: GuestSessionResponse, bob: GuestSessionResponse) {
  const created = await api<{ matchId: string; inviteCode: string }>("/api/matches", alice.token, { displayName: "Alice", seatCount: 2, rulesetName: "standard" });
  await api("/api/matches/join", bob.token, { inviteCode: created.data.inviteCode, displayName: "Bob" });
  const view = (await api<MatchView>(`/api/matches/${created.data.matchId}`, alice.token)).data;
  const aliceFirst = view.state?.activePlayerId === view.youAre;
  return { matchId: created.data.matchId, view, first: aliceFirst ? alice : bob, second: aliceFirst ? bob : alice };
}

describe("a background connection", () => {
  it("does not make its player look online", async () => {
    await start();
    const [alice, bob] = [await guest("Alice"), await guest("Bob")];
    const { matchId } = await startMatch(alice, bob);
    const bobSeat = async () => (await api<MatchView>(`/api/matches/${matchId}`, alice.token)).data.seats.find((s) => s.displayName === "Bob");

    const background = await connect(bob.token, "background");
    await pause(50);
    expect((await bobSeat())?.connected).toBe(false);

    const open = await connect(bob.token);
    await waitFor(() => open.messages.length > 0);
    expect((await bobSeat())?.connected).toBe(true);
    [background, open].forEach((c) => c.ws.close());
  });

  it("hears turn notices, so no push goes out while it is connected", async () => {
    await start();
    const [alice, bob] = [await guest("Alice"), await guest("Bob")];
    const endpoint = (name: string) => `https://fcm.googleapis.com/fcm/send/${name}`;
    const keys = { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" };
    await api("/api/push/subscribe", alice.token, { endpoint: endpoint("alice"), keys });
    await api("/api/push/subscribe", bob.token, { endpoint: endpoint("bob-2"), keys });
    const sockets = new Map([alice, bob].map((g) => [g, null as Connection | null]));
    for (const g of sockets.keys()) sockets.set(g, await connect(g.token, "background"));

    const { matchId, view, first, second } = await startMatch(alice, bob);
    await waitFor(() => noticesIn(sockets.get(first)!).length > 0);
    await pause(100);

    expect(noticesIn(sockets.get(first)!)).toEqual([expect.objectContaining({ matchId, kind: "your_turn", revision: view.state?.revision })]);
    expect(noticesIn(sockets.get(second)!)).toEqual([]);
    expect(pushes).toEqual([]);
    for (const c of sockets.values()) c!.ws.close();
  });

  it("is told on connecting which turns are waiting for its player", async () => {
    await start();
    const [alice, bob] = [await guest("Alice"), await guest("Bob")];
    const { matchId, view, first, second } = await startMatch(alice, bob);

    const waiting = await connect(first.token, "background");
    const other = await connect(second.token, "background");
    await waitFor(() => pendingIn(waiting).length > 0 && pendingIn(other).length > 0);

    expect(pendingIn(waiting)).toEqual([[expect.objectContaining({ matchId, kind: "your_turn", title: "Your turn", revision: view.state?.revision })]]);
    expect(pendingIn(other)).toEqual([[]]);
    // The app judges from this when the connection has gone quiet for too long.
    expect(waiting.messages).toContainEqual(expect.objectContaining({ type: "pending_notices", keepaliveMs: BACKGROUND_HEARTBEAT_MS }));
    // An open app shows its matches itself.
    const open = await connect(first.token);
    await pause(100);
    expect(pendingIn(open)).toEqual([]);
    [waiting, other, open].forEach((c) => c.ws.close());
  });

  it("is pinged every few minutes rather than every few seconds, with a keepalive it can see", async () => {
    await start();
    const ann = await guest("Ann");
    const background = await connect(ann.token, "background");
    const open = await connect(ann.token);

    await pause(BACKGROUND_HEARTBEAT_MS * 0.6);
    expect(open.pings).toBeGreaterThanOrEqual(3);
    expect(background.pings).toBe(0);
    expect(background.messages.filter((m) => m.type === "keepalive")).toHaveLength(0);

    await waitFor(() => background.pings >= 1, BACKGROUND_HEARTBEAT_MS * 2);
    await waitFor(() => background.messages.some((m) => m.type === "keepalive"));
    // A ping frame is invisible to the phone's WebSocket library; the keepalive
    // is how the app knows the connection still works.
    expect(open.messages.some((m) => m.type === "keepalive")).toBe(false);
    [background, open].forEach((c) => c.ws.close());
  });

  it("is dropped soon after a ping it does not answer, but is not pinged early", async () => {
    await start();
    const ann = await guest("Ann");
    const silentOpen = await connect(ann.token, undefined, { autoPong: false });
    const silentBackground = await connect(ann.token, "background", { autoPong: false });
    const connectedAt = Date.now();

    await waitFor(() => silentOpen.closed, HEARTBEAT_MS * 10);
    expect(silentBackground.closed).toBe(false);
    // A dead phone connection holds a socket slot and keeps email back, so it
    // goes a heartbeat or two after its unanswered ping, not a whole interval later.
    await waitFor(() => silentBackground.closed, BACKGROUND_HEARTBEAT_MS * 4);
    expect(Date.now() - connectedAt).toBeGreaterThanOrEqual(BACKGROUND_HEARTBEAT_MS);
    expect(Date.now() - connectedAt).toBeLessThan(BACKGROUND_HEARTBEAT_MS + HEARTBEAT_MS * 5);
  });
});
