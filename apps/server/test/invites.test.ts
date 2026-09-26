import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ApiErrorBody, GuestSessionResponse, InviteAcceptResponse, InviteSettings } from "@manors-menaces/protocol";
import { createApp } from "../src/app.js";
import { FRIEND_INVITE_DEVICES, INVITES_PER_PERSON, Invites } from "../src/invites.js";

// An invite-only server (INVITE_ONLY): the game, the API and the WebSocket
// open only to people who accepted a personal invite, and each of them may
// invite up to ten more.

let app: ReturnType<typeof createApp>;
let base = "";
let invites: Invites;

function webDist(): string {
  const root = mkdtempSync(join(tmpdir(), "mm-invite-web-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "index.html"), "<!doctype html>the game");
  writeFileSync(join(root, "assets", "app.js"), "console.log('the game')");
  return root;
}

async function start(inviteOnly = true) {
  app = createApp({ webDist: webDist(), aiDelayMs: 5, rateLimitPerSecond: 10_000, inviteOnly });
  await new Promise<void>((r) => app.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  invites = new Invites(app.store);
}

afterEach(async () => {
  await app.close();
});

/** A browser: remembers the pass cookie the server sets, unless it calls from another origin. */
function browser(keepsCookies = true) {
  let cookie: string | null = null;
  const request = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(base + path, { redirect: "manual", ...init, headers: { ...(init.headers as Record<string, string>), ...(cookie ? { cookie } : {}) } });
    const set = res.headers.getSetCookie().find((c) => c.startsWith("mm_pass="));
    if (set && keepsCookies) cookie = set.split(";")[0] as string;
    return { status: res.status, body: await res.text(), headers: res.headers, setCookie: set ?? null };
  };
  const api = async <T>(path: string, token: string | null, body?: unknown) => {
    const res = await request(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, data: JSON.parse(res.body) as T & Partial<ApiErrorBody> };
  };
  return { request, api, cookie: () => cookie };
}

/** The desktop and Android apps call the API from another origin, without cookies. */
const appClient = () => browser(false);

/** A browser that accepted `code`, with a guest session. */
async function invitedPlayer(code: string, name: string) {
  const b = browser();
  expect((await b.request(`/invite/${code}`, { method: "POST" })).status).toBe(303);
  const g = await b.api<GuestSessionResponse>("/api/guest", null, { displayName: name });
  expect(g.status).toBe(200);
  return { ...b, token: g.data.token };
}

function socketOpens(token: string, cookie: string | null = null): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${base.replace("http", "ws")}/api/ws?token=${token}`, cookie ? { headers: { cookie } } : {});
    // A handshake that never finishes counts as refused, rather than hanging the test.
    const timer = setTimeout(() => {
      ws.terminate();
      resolve(false);
    }, 2_000);
    ws.on("open", () => {
      clearTimeout(timer);
      ws.close();
      resolve(true);
    });
    ws.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

describe("an invite-only server", () => {
  it("shows people without an invite only that the game is invite-only", async () => {
    await start();
    const b = browser();
    for (const path of ["/", "/index.html", "/assets/app.js", "/some/route"]) {
      const res = await b.request(path);
      expect(res.status, path).toBe(403);
      expect(res.body, path).toMatch(/invite-only/i);
      expect(res.body, path).not.toContain("the game");
    }
    expect((await b.api("/api/health", null)).status).toBe(200);
  });

  it("opens the game to a browser that accepts a personal invite, and remembers it", async () => {
    await start();
    const anna = invites.create({ name: "Anna" });
    const b = browser();

    // Link previews and mail scanners open links: opening one only asks.
    const asking = await b.request(`/invite/${anna.code}`);
    expect(asking.status).toBe(200);
    expect(asking.body).toContain("Anna");
    expect(asking.body).toMatch(/<form method="post"/);
    expect(asking.setCookie).toBeNull();
    expect(invites.list()[0]?.devices).toBe(0);

    const accepted = await b.request(`/invite/${anna.code}`, { method: "POST" });
    expect(accepted.status).toBe(303);
    expect(accepted.headers.get("location")).toBe("/?invited=Anna");
    expect(accepted.setCookie).toMatch(/HttpOnly/i);
    expect(accepted.setCookie).toMatch(/SameSite=Lax/i);
    expect(accepted.setCookie).toMatch(/Max-Age=\d{7,}/);
    expect(invites.list()[0]?.devices).toBe(1);

    expect((await b.request("/")).body).toContain("the game");
    expect((await b.request("/assets/app.js")).body).toContain("the game");
    // Another invite link opened on a device that already has one uses nothing up.
    const other = invites.create({ name: "Bert", maxDevices: 1 });
    const again = await b.request(`/invite/${other.code}`);
    expect(again.status).toBe(303);
    expect(invites.list().find((i) => i.id === other.id)?.devices).toBe(0);
  });

  it("marks the pass cookie Secure behind an HTTPS proxy", async () => {
    await start();
    const { code } = invites.create({ name: "Anna" });
    const accepted = await browser().request(`/invite/${code}`, { method: "POST", headers: { "x-forwarded-proto": "https" } });
    expect(accepted.setCookie).toMatch(/;\s*Secure/i);
    const plain = await browser().request(`/invite/${invites.create({ name: "Bert" }).code}`, { method: "POST" });
    expect(plain.setCookie).not.toMatch(/;\s*Secure/i);
  });

  it("refuses unknown, used up, expired and revoked invites", async () => {
    await start();
    expect((await browser().request("/invite/nosuchcode")).status).toBe(410);
    expect((await browser().request("/invite/nosuchcode", { method: "POST" })).status).toBe(410);

    const once = invites.create({ name: "Cleo", maxDevices: 1 });
    expect((await browser().request(`/invite/${once.code}`, { method: "POST" })).status).toBe(303);
    const second = await browser().request(`/invite/${once.code}`, { method: "POST" });
    expect(second.status).toBe(410);
    expect(second.setCookie).toBeNull();

    const late = invites.create({ name: "Dora", days: 1 });
    app.store.db.prepare("UPDATE invites SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), late.id);
    expect((await browser().request(`/invite/${late.code}`, { method: "POST" })).status).toBe(410);

    const gone = invites.create({ name: "Emil" });
    expect(invites.revoke(gone.id)).toBe(true);
    expect((await browser().request(`/invite/${gone.code}`, { method: "POST" })).status).toBe(410);
  });

  it("lets devices in after an invite expires, and shuts them out when it is revoked", async () => {
    await start();
    const anna = invites.create({ name: "Anna", days: 1 });
    const player = await invitedPlayer(anna.code, "Anna");
    app.store.db.prepare("UPDATE invites SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), anna.id);
    expect((await player.request("/")).status).toBe(200);
    expect((await player.api("/api/matches", player.token)).status).toBe(200);

    invites.revoke(anna.id);
    expect((await player.request("/")).status).toBe(403);
    const refused = await player.api("/api/matches", player.token);
    expect(refused.status).toBe(403);
    expect(refused.data.code).toBe("INVITE_REQUIRED");
    expect(await socketOpens(player.token, player.cookie())).toBe(false);
  });

  it("revokes one invite without affecting the others", async () => {
    await start();
    const anna = await invitedPlayer(invites.create({ name: "Anna" }).code, "Anna");
    const bert = invites.create({ name: "Bert" });
    const bertPlayer = await invitedPlayer(bert.code, "Bert");
    invites.revoke(bert.id);
    expect((await anna.api("/api/matches", anna.token)).status).toBe(200);
    expect((await bertPlayer.api("/api/matches", bertPlayer.token)).status).toBe(403);
  });

  it("gives guest sessions and sockets only to invited people", async () => {
    await start();
    const stranger = browser();
    const refused = await stranger.api("/api/guest", null, { displayName: "Mallory" });
    expect(refused.status).toBe(403);
    expect(refused.data.code).toBe("INVITE_REQUIRED");

    // A guest from before the server became invite-only.
    const old = app.service.createGuest("Old");
    expect((await stranger.api("/api/me", old.token)).data.code).toBe("INVITE_REQUIRED");
    expect(await socketOpens(old.token)).toBe(false);

    const player = await invitedPlayer(invites.create({ name: "Anna" }).code, "Anna");
    expect((await player.api("/api/me", player.token)).status).toBe(200);
    expect(await socketOpens(player.token, player.cookie())).toBe(true);
    // The session carries the invite, so it works without the cookie too (the Android app's background socket).
    expect(await socketOpens(player.token)).toBe(true);
  });

  it("asks the apps for the invite code once", async () => {
    await start();
    const anna = invites.create({ name: "Anna" });
    const client = appClient();
    expect((await client.api("/api/guest", null, { displayName: "Anna" })).data.code).toBe("INVITE_REQUIRED");
    const wrong = await client.api("/api/guest", null, { displayName: "Anna", inviteCode: "nosuchcode" });
    expect(wrong.status).toBe(403);
    expect(wrong.data.code).toBe("INVITE_INVALID");
    const g = await client.api<GuestSessionResponse>("/api/guest", null, { displayName: "Anna", inviteCode: anna.code });
    expect(g.status).toBe(200);
    expect((await client.api("/api/matches", g.data.token)).status).toBe(200);
    expect(invites.list()[0]).toMatchObject({ devices: 1, players: ["Anna"] });

    // A guest session from before: the code admits it.
    const old = app.service.createGuest("Old");
    expect((await client.api("/api/invites/accept", old.token, {})).data.code).toBe("INVITE_INVALID");
    expect((await client.api("/api/invites/accept", old.token, { code: "nosuchcode" })).data.code).toBe("INVITE_INVALID");
    expect((await client.api("/api/invites/accept", old.token, { code: anna.code })).status).toBe(200);
    expect((await client.api("/api/matches", old.token)).status).toBe(200);
    expect(invites.list()[0]).toMatchObject({ devices: 2, players: ["Anna", "Anna"] });
  });

  it("names the player after the invite they accept", async () => {
    await start();

    // A browser: the redirect carries the name for the app to remember.
    const b = browser();
    const accepted = await b.request(`/invite/${invites.create({ name: "Anna Lee" }).code}`, { method: "POST" });
    expect(accepted.headers.get("location")).toBe("/?invited=Anna%20Lee");
    // Once in, the name the player signs in with is theirs to choose.
    expect((await b.api<GuestSessionResponse>("/api/guest", null, { displayName: "Annie" })).data.displayName).toBe("Annie");

    // The apps: the code names the new guest session, whatever the name field said.
    const bert = invites.create({ name: "Bert" });
    const g = await appClient().api<GuestSessionResponse>("/api/guest", null, { displayName: "Someone", inviteCode: bert.code });
    expect(g.data.displayName).toBe("Bert");

    // A guest session from before, admitted with a code, takes the invite's name.
    const cleo = invites.create({ name: "Cleo" });
    const old = app.service.createGuest("Old");
    const client = appClient();
    expect((await client.api<InviteAcceptResponse>("/api/invites/accept", old.token, { code: cleo.code })).data.displayName).toBe("Cleo");
    expect((await client.api<{ displayName: string }>("/api/me", old.token)).data.displayName).toBe("Cleo");
  });

  it("keeps invites that admit no device or allow negative invites out of the database", async () => {
    await start();
    expect(() => invites.create({ name: "Nobody", maxDevices: 0 })).toThrow(/CHECK/);
    expect(() => invites.create({ name: "Nobody", quota: -1 })).toThrow(/CHECK/);
    // A clash of random ids is not an error: create() draws again.
    const taken = invites.create({ name: "Anna" });
    expect(app.store.createInvite({ ...taken, code: "another-code" })).toBe(false);
  });

  it("admits a guest session from before through the browser's invite", async () => {
    await start();
    const old = app.service.createGuest("Old");
    const b = browser();
    await b.request(`/invite/${invites.create({ name: "Anna" }).code}`, { method: "POST" });
    expect((await b.api("/api/me", old.token)).status).toBe(200);
  });
});

describe("inviting friends", () => {
  it("is not offered when the server is open to everyone", async () => {
    await start(false);
    const b = browser();
    expect((await b.request("/")).body).toContain("the game");
    const g = await b.api<GuestSessionResponse>("/api/guest", null, { displayName: "Anna" });
    expect((await b.api<InviteSettings>("/api/invites", g.data.token)).data).toEqual({ available: false, quota: 0, invites: [] });
    expect((await b.api("/api/invites", g.data.token, { name: "Bert" })).status).toBe(404);
  });

  it("lets each invited person invite up to ten others, each on a few devices", async () => {
    await start();
    const anna = invites.create({ name: "Anna" });
    const player = await invitedPlayer(anna.code, "Anna");
    expect((await player.api<InviteSettings>("/api/invites", player.token)).data).toEqual({ available: true, quota: INVITES_PER_PERSON, invites: [] });

    const made = await player.api<InviteSettings>("/api/invites", player.token, { name: "  Bert <b> " });
    expect(made.status).toBe(200);
    const bert = made.data.invites[0];
    expect(bert).toMatchObject({ name: "Bert b", devices: 0, maxDevices: FRIEND_INVITE_DEVICES, revoked: false });
    expect(bert?.code).toMatch(/^[a-z0-9]{12}$/);

    // Bert's link works, and Bert may invite ten people too.
    const bertPlayer = await invitedPlayer(bert?.code ?? "", "Bert");
    expect((await bertPlayer.api<InviteSettings>("/api/invites", bertPlayer.token)).data).toMatchObject({ quota: INVITES_PER_PERSON, invites: [] });
    expect((await player.api<InviteSettings>("/api/invites", player.token)).data.invites[0]?.devices).toBe(1);
    expect(invites.list().find((i) => i.name === "Bert b")).toMatchObject({ invitedBy: "Anna", players: ["Bert"] });

    for (let i = 1; i < INVITES_PER_PERSON; i++) expect((await player.api("/api/invites", player.token, { name: `Friend ${i}` })).status).toBe(200);
    const eleventh = await player.api("/api/invites", player.token, { name: "One too many" });
    expect(eleventh.status).toBe(409);
    expect((await player.api<InviteSettings>("/api/invites", player.token)).data.invites).toHaveLength(INVITES_PER_PERSON);
  });

  it("counts the invites of one person across their devices", async () => {
    await start();
    const { code } = invites.create({ name: "Anna" });
    const phone = await invitedPlayer(code, "Anna");
    const laptop = await invitedPlayer(code, "Anna");
    await phone.api("/api/invites", phone.token, { name: "Bert" });
    expect((await laptop.api<InviteSettings>("/api/invites", laptop.token)).data.invites.map((i) => i.name)).toEqual(["Bert"]);
  });

  it("follows the operator's allowance for an invite", async () => {
    await start();
    const player = await invitedPlayer(invites.create({ name: "Anna", quota: 0 }).code, "Anna");
    expect((await player.api<InviteSettings>("/api/invites", player.token)).data.quota).toBe(0);
    expect((await player.api("/api/invites", player.token, { name: "Bert" })).status).toBe(409);
  });

  it("wants a name for each invite", async () => {
    await start();
    const player = await invitedPlayer(invites.create({ name: "Anna" }).code, "Anna");
    for (const name of ["", "   ", 42, null]) expect((await player.api("/api/invites", player.token, { name })).status, String(name)).toBe(400);
  });

  it("withdraws an unused invite to free its place, but not a used one or another person's", async () => {
    await start();
    const player = await invitedPlayer(invites.create({ name: "Anna" }).code, "Anna");
    const made = (await player.api<InviteSettings>("/api/invites", player.token, { name: "Bert" })).data.invites[0];
    const used = (await player.api<InviteSettings>("/api/invites", player.token, { name: "Cleo" })).data.invites[1];
    await invitedPlayer(used?.code ?? "", "Cleo");

    const other = await invitedPlayer(invites.create({ name: "Dora" }).code, "Dora");
    expect((await other.api("/api/invites/withdraw", other.token, { id: made?.id })).status).toBe(404);
    expect((await player.api("/api/invites/withdraw", player.token, { id: used?.id })).status).toBe(409);

    const left = await player.api<InviteSettings>("/api/invites/withdraw", player.token, { id: made?.id });
    expect(left.status).toBe(200);
    expect(left.data.invites.map((i) => i.name)).toEqual(["Cleo"]);
    expect((await browser().request(`/invite/${made?.code}`, { method: "POST" })).status).toBe(410);
  });
});
