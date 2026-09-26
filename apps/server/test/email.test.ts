import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { EmailSettings, GuestSessionResponse, MatchView } from "@manors-menaces/protocol";
import { createApp } from "../src/app.js";
import type { Mail } from "../src/mail.js";

// Turn notices by email (spec §85) for players whose app is closed: only to
// an address its owner confirmed, and every message says how to stop them.

const PUBLIC_URL = "https://play.example.org";
let app: ReturnType<typeof createApp>;
let base = "";
let mails: Mail[] = [];
let sendFails = false;

async function start(email = true) {
  mails = [];
  sendFails = false;
  const transport = async (mail: Mail) => {
    if (sendFails) throw new Error("SMTP server said no");
    mails.push(mail);
  };
  app = createApp({ webDist: null, aiDelayMs: 5, rateLimitPerSecond: 10_000, ...(email ? { email: { from: "Manors <turns@example.org>", publicUrl: PUBLIC_URL, transport } } : {}) });
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

/** The link to `path` in a mail, on this test server instead of the public address. */
function link(mail: Mail | undefined, path: string): string {
  const found = mail?.text.match(new RegExp(`${PUBLIC_URL.replace(/\./g, "\\.")}(${path}\\?[\\w=&-]+)`));
  if (!found) throw new Error(`no ${path} link in ${JSON.stringify(mail?.text)}`);
  return base + found[1];
}

const page = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, init);
  return { status: res.status, html: await res.text(), type: res.headers.get("content-type") };
};

/** A guest with a confirmed address. */
async function withEmail(name: string, address: string) {
  const g = await guest(name);
  await api("/api/email", g.token, { address });
  await page(link(mails.at(-1), "/api/email/confirm"), { method: "POST" });
  return g;
}

/** Starts a two-player match; the match start tells the first player to act. */
async function startMatch(alice: GuestSessionResponse, bob: GuestSessionResponse) {
  const created = await api<{ matchId: string; inviteCode: string }>("/api/matches", alice.token, { displayName: "Alice", seatCount: 2, rulesetName: "standard" });
  await api("/api/matches/join", bob.token, { inviteCode: created.data.inviteCode, displayName: "Bob" });
  const view = (await api<MatchView>(`/api/matches/${created.data.matchId}`, alice.token)).data;
  return { matchId: created.data.matchId, first: view.state?.activePlayerId === view.youAre ? alice : bob };
}

/** Starts matches until one opens on `target`'s turn (the first player is drawn at random). */
async function matchOpeningWith(target: GuestSessionResponse, other: GuestSessionResponse) {
  for (let i = 0; i < 30; i++) {
    const started = await startMatch(target, other);
    if (started.first === target) return started;
  }
  throw new Error(`${target.displayName} never moved first`);
}

async function waitFor(ok: () => boolean, ms = 3000): Promise<void> {
  for (const end = Date.now() + ms; !ok() && Date.now() < end; ) await new Promise((r) => setTimeout(r, 20));
  if (!ok()) throw new Error(`waitFor: still not true after ${ms} ms`);
}
const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));

describe("email notices", () => {
  it("are offered only when the server can send mail", async () => {
    await start(false);
    const ann = await guest("Ann");
    expect((await api<EmailSettings>("/api/email", ann.token)).data).toEqual({ available: false, address: null, confirmed: false });
    expect((await api("/api/email", ann.token, { address: "ann@example.org" })).status).toBe(404);
  });

  it("start with a confirmation email, and only its button turns them on", async () => {
    await start();
    const ann = await guest("Ann");
    const asked = await api<EmailSettings>("/api/email", ann.token, { address: "  Ann@Example.org " });
    expect(asked).toEqual({ status: 200, data: { available: true, address: "Ann@Example.org", confirmed: false } });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "Ann@Example.org", from: "Manors <turns@example.org>" });
    expect(mails[0]!.subject).toMatch(/confirm/i);

    // Mail scanners open links to check them: opening one only asks.
    const confirm = link(mails[0], "/api/email/confirm");
    const asking = await page(confirm);
    expect(asking.status).toBe(200);
    expect(asking.type).toMatch(/^text\/html/);
    expect(asking.html).toContain("Ann@Example.org");
    expect(asking.html).toMatch(/<form method="post"/);
    expect((await api<EmailSettings>("/api/email", ann.token)).data.confirmed).toBe(false);

    const confirmed = await page(confirm, { method: "POST" });
    expect(confirmed.status).toBe(200);
    expect((await api<EmailSettings>("/api/email", ann.token)).data).toEqual({ available: true, address: "Ann@Example.org", confirmed: true });

    // Asking again for the confirmed address sends nothing new.
    expect((await api<EmailSettings>("/api/email", ann.token, { address: "ann@example.org" })).data.confirmed).toBe(true);
    expect(mails).toHaveLength(1);
  });

  it("do not confirm with a link that is unknown, used or out of date", async () => {
    await start();
    const ann = await guest("Ann");
    await api("/api/email", ann.token, { address: "ann@example.org" });
    const confirm = link(mails[0], "/api/email/confirm");
    expect((await page(confirm.replace(/t=[\w-]+/, "t=forged"), { method: "POST" })).status).toBe(410);

    app.store.db.prepare("UPDATE email_addresses SET requested_at = ?").run(new Date(Date.now() - 25 * 3600_000).toISOString());
    expect((await page(confirm)).status).toBe(410);
    expect((await page(confirm, { method: "POST" })).status).toBe(410);
    expect((await api<EmailSettings>("/api/email", ann.token)).data.confirmed).toBe(false);

    await api("/api/email", ann.token, { address: "ann@example.org" });
    const fresh = link(mails.at(-1), "/api/email/confirm");
    expect((await page(fresh, { method: "POST" })).status).toBe(200);
    expect((await page(fresh, { method: "POST" })).status).toBe(410);
  });

  it("go to a player whose app is closed when it is their turn, with a way to stop them", async () => {
    await start();
    const alice = await withEmail("Alice", "alice@example.org");
    const bob = await withEmail("Bob", "bob@example.org");
    mails = [];
    const { matchId, first } = await startMatch(alice, bob);

    await waitFor(() => mails.length > 0);
    await settle();
    expect(mails).toHaveLength(1);
    const mail = mails[0]!;
    expect(mail.to).toBe(first === alice ? "alice@example.org" : "bob@example.org");
    expect(mail.subject).toMatch(/^Your turn/);
    expect(mail.text).toContain(`${PUBLIC_URL}/#/match/${matchId}`);
    expect(mail.text).toContain(first === alice ? "Bob" : "Alice");
    const unsubscribe = link(mail, "/api/email/unsubscribe");
    expect(mail.headers["List-Unsubscribe"]).toBe(`<${unsubscribe.replace(base, PUBLIC_URL)}>`);
    expect(mail.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(mail.headers["Auto-Submitted"]).toBe("auto-generated");
  });

  it("are not sent while the app is open, or to an address nobody confirmed", async () => {
    await start();
    const alice = await withEmail("Alice", "alice@example.org");
    const bob = await withEmail("Bob", "bob@example.org");
    const sockets = await Promise.all([alice, bob].map((g) => open(g.token)));
    mails = [];
    await startMatch(alice, bob);
    await settle();
    expect(mails).toEqual([]);
    sockets.forEach((ws) => ws.close());

    const cara = await guest("Cara");
    const dan = await guest("Dan");
    await api("/api/email", cara.token, { address: "cara@example.org" });
    await api("/api/email", dan.token, { address: "dan@example.org" });
    mails = [];
    await startMatch(cara, dan);
    await settle();
    expect(mails).toEqual([]);
  });

  it("stop from the email's link, by the button or in one click", async () => {
    await start();
    const ann = await withEmail("Ann", "ann@example.org");
    mails = [];
    await matchOpeningWith(ann, await guest("Bob"));
    await waitFor(() => mails.length > 0);
    const unsubscribe = link(mails[0], "/api/email/unsubscribe");

    const asking = await page(unsubscribe);
    expect(asking.status).toBe(200);
    expect(asking.html).toMatch(/<form method="post"/);
    expect((await api<EmailSettings>("/api/email", ann.token)).data.confirmed).toBe(true);
    expect((await page(unsubscribe.replace(/t=[\w-]+/, "t=forged"), { method: "POST" })).status).toBe(403);

    // RFC 8058: the mail client posts this body to the List-Unsubscribe address.
    const done = await page(unsubscribe, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
    expect(done.status).toBe(200);
    expect((await api<EmailSettings>("/api/email", ann.token)).data).toEqual({ available: true, address: null, confirmed: false });
  });

  it("can be turned off in the lobby", async () => {
    await start();
    const ann = await withEmail("Ann", "ann@example.org");
    expect((await api<EmailSettings>("/api/email/remove", ann.token, {})).data).toEqual({ available: true, address: null, confirmed: false });
    mails = [];
    await matchOpeningWith(ann, await guest("Bob"));
    await settle();
    expect(mails).toEqual([]);
  });

  it("refuse what is not an address, and limit confirmation emails", async () => {
    await start();
    const ann = await guest("Ann");
    for (const address of ["", "ann", "ann@", "@example.org", "ann@example", "a b@example.org", "ann@example.org\r\nBcc: x@example.org", "<ann@example.org>", "ann@example.org, bob@example.org", `${"a".repeat(250)}@example.org`, 42, null]) {
      expect((await api("/api/email", ann.token, { address })).status, JSON.stringify(address)).toBe(400);
    }
    expect(mails).toEqual([]);

    // One address hears from at most three guests a day, whoever creates them.
    for (const name of ["A", "B", "C"]) expect((await api("/api/email", (await guest(name)).token, { address: "target@example.org" })).status).toBe(200);
    expect((await api("/api/email", (await guest("D")).token, { address: "target@example.org" })).status).toBe(429);
    // And one guest sends at most five a day.
    for (let i = 1; i <= 5; i++) expect((await api("/api/email", ann.token, { address: `ann${i}@example.org` })).status).toBe(200);
    expect((await api("/api/email", ann.token, { address: "ann6@example.org" })).status).toBe(429);
    expect(mails).toHaveLength(8);
  });

  it("say so when the confirmation email cannot be sent", async () => {
    await start();
    const ann = await guest("Ann");
    sendFails = true;
    const res = await api<{ error: string }>("/api/email", ann.token, { address: "ann@example.org" });
    expect(res.status).toBe(502);
    expect((await api<EmailSettings>("/api/email", ann.token)).data).toEqual({ available: true, address: null, confirmed: false });
  });
});

async function open(token: string): Promise<WebSocket> {
  const ws = new WebSocket(`${base.replace("http", "ws")}/api/ws?token=${token}`);
  await new Promise<void>((r) => ws.on("open", () => r()));
  return ws;
}
