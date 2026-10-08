import { mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiErrorBody, GiveawayResponse, GuestSessionResponse } from "@manors-menaces/protocol";
import { createApp } from "../src/app.js";
import { GIVEAWAY_DEFAULT_NAME, GIVEAWAY_KEY_TRIES, Giveaway, giveawayConfigFromEnv } from "../src/giveaway.js";
import { FRIEND_INVITE_DEVICES, INVITES_PER_PERSON, Invites } from "../src/invites.js";
import { Store } from "../src/store.js";

// The giveaway (GIVEAWAY_INVITE, GIVEAWAY_ORIGIN): a hidden game on the
// operator's website wins a personal invite to an invite-only server. The
// sponsor invite's own quota caps the giveaway in total, and each client
// address gets one invite a day.

const ORIGIN = "https://apps.example.org";
const PUBLIC_URL = "https://play.example.org";
const SPONSOR_ID = "sp0ns0r";
const KEY = "scare-crow-first-3";

function webDist(): string {
  const root = mkdtempSync(join(tmpdir(), "mm-giveaway-web-"));
  writeFileSync(join(root, "index.html"), "<!doctype html>the game");
  return root;
}

/** The sponsor GIVEAWAY_INVITE names, as `invites create Carnival --uses 1 --invites N` makes it. */
function makeSponsor(store: Store, quota: number, id = SPONSOR_ID): void {
  store.createInvite({
    id,
    code: `code-${id}`,
    name: "Carnival",
    invited_by: null,
    max_devices: 1,
    quota,
    expires_at: null,
    created_at: new Date().toISOString(),
    revoked_at: null,
  });
}

describe("the giveaway endpoint", () => {
  let app: ReturnType<typeof createApp> | null = null;
  let base = "";
  let invites: Invites;

  interface StartOptions {
    inviteOnly?: boolean;
    /** false: no giveaway option; a string: a sponsor id to name instead of the created one. */
    giveaway?: false | string;
    /** GIVEAWAY_KEY: the puzzle key every claim must carry. */
    giveawayKey?: string;
    sponsorQuota?: number;
    trustProxy?: number;
  }

  async function start(opts: StartOptions = {}) {
    app = createApp({
      webDist: webDist(),
      aiDelayMs: 5,
      rateLimitPerSecond: 10_000,
      inviteOnly: opts.inviteOnly ?? true,
      trustProxy: opts.trustProxy ?? 0,
      ...(opts.giveaway === false
        ? {}
        : { giveaway: { sponsor: opts.giveaway ?? SPONSOR_ID, origin: ORIGIN, publicUrl: PUBLIC_URL, ...(opts.giveawayKey ? { key: opts.giveawayKey } : {}) } }),
    });
    await new Promise<void>((r) => app?.server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    invites = new Invites(app.store);
    makeSponsor(app.store, opts.sponsorQuota ?? 5);
  }

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  /** POST /api/giveaway, as the website's hidden game would call it. */
  async function post(body: unknown = {}, headers: Record<string, string> = {}) {
    const res = await fetch(`${base}/api/giveaway`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: (await res.json()) as Partial<GiveawayResponse> & Partial<ApiErrorBody>, headers: res.headers };
  }

  /** An address the trusted proxy reports for the request. */
  const forwarded = (address: string) => ({ "x-forwarded-for": address });

  /** A browser that remembers the pass cookie the server sets. */
  function browser() {
    let cookie: string | null = null;
    const request = async (path: string, init: RequestInit = {}) => {
      const res = await fetch(base + path, { redirect: "manual", ...init, headers: { ...(init.headers as Record<string, string>), ...(cookie ? { cookie } : {}) } });
      const set = res.headers.getSetCookie().find((c) => c.startsWith("mm_pass="));
      if (set) cookie = set.split(";")[0] as string;
      return { status: res.status, body: await res.text() };
    };
    const api = async <T>(path: string, token: string | null, body?: unknown) => {
      const res = await request(path, {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: res.status, data: JSON.parse(res.body) as T & Partial<ApiErrorBody> };
    };
    return { request, api };
  }

  it("answers 404 GIVEAWAY_OFF when no giveaway is configured", async () => {
    await start({ giveaway: false });
    const res = await post();
    expect(res.status).toBe(404);
    expect(res.data.code).toBe("GIVEAWAY_OFF");
  });

  it("answers 404 GIVEAWAY_OFF on a server that is not invite-only", async () => {
    await start({ inviteOnly: false });
    const res = await post();
    expect(res.status).toBe(404);
    expect(res.data.code).toBe("GIVEAWAY_OFF");
  });

  it("mints a friend invite of the sponsor's and hands back its whole link", async () => {
    await start();
    const res = await post({ name: "Winner Wanda" });
    expect(res.status).toBe(200);
    const { url, code, name } = res.data;
    expect(url).toBe(`${PUBLIC_URL}/invite/${code}`);
    expect(code).toMatch(/^[a-z0-9]{12}$/);
    expect(name).toBe("Winner Wanda");

    // An ordinary friend invite: made by the sponsor, three devices, ten onward.
    expect(invites.list().find((i) => i.code === code)).toMatchObject({
      name: "Winner Wanda",
      invitedBy: "Carnival",
      maxDevices: FRIEND_INVITE_DEVICES,
      quota: INVITES_PER_PERSON,
    });

    // Its page names the sponsor, and accepting it admits the winner's device.
    const b = browser();
    const page = await b.request(`/invite/${code}`);
    expect(page.status).toBe(200);
    expect(page.body).toContain("Carnival invites you");
    expect((await b.request(`/invite/${code}`, { method: "POST" })).status).toBe(303);
    const g = await b.api<GuestSessionResponse>("/api/guest", null, { displayName: "Wanda" });
    expect(g.status).toBe(200);
    expect((await b.api("/api/me", g.data.token ?? null)).status).toBe(200);
    expect(invites.list().find((i) => i.code === code)?.devices).toBe(1);
  });

  it("names the invite after the winner, cleaned, or the default", async () => {
    await start({ trustProxy: 1, sponsorQuota: 10 });
    // Each address mints once a day, so every ask comes from somewhere else.
    const named = await post({ name: "  Ada <i>Lovelace</i>  " }, forwarded("203.0.113.1"));
    expect(named.data.name).toBe("Ada iLovelace/i");
    const bodies: unknown[] = [{}, { name: "   " }, { name: 42 }, { name: null }];
    for (const [i, body] of bodies.entries()) {
      const res = await post(body, forwarded(`203.0.113.${i + 2}`));
      expect(res.data.name, JSON.stringify(body)).toBe(GIVEAWAY_DEFAULT_NAME);
    }
  });

  it("refuses a second invite to the same address within a day", async () => {
    await start();
    expect((await post()).status).toBe(200);
    const again = await post({ name: "Greedy" });
    expect(again.status).toBe(429);
    expect(again.data.code).toBe("GIVEAWAY_LIMIT");
    expect(again.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    // Nothing was minted for the refused ask.
    expect(invites.list().filter((i) => i.invitedBy === "Carnival")).toHaveLength(1);
  });

  it("keys the limit on the client address a trusted proxy reports", async () => {
    await start({ trustProxy: 1 });
    expect((await post({}, forwarded("198.51.100.9"))).status).toBe(200);
    expect((await post({}, forwarded("198.51.100.10"))).status).toBe(200);
    expect((await post({}, forwarded("198.51.100.9"))).data.code).toBe("GIVEAWAY_LIMIT");
  });

  it("answers 410 GIVEAWAY_EMPTY once the sponsor's invites are gone", async () => {
    await start({ sponsorQuota: 1, trustProxy: 1 });
    expect((await post({}, forwarded("198.51.100.20"))).status).toBe(200);
    const empty = await post({}, forwarded("198.51.100.21"));
    expect(empty.status).toBe(410);
    expect(empty.data.code).toBe("GIVEAWAY_EMPTY");
  });

  it("answers 410 GIVEAWAY_EMPTY when the sponsor is revoked", async () => {
    await start();
    invites.revoke(SPONSOR_ID);
    const res = await post();
    expect(res.status).toBe(410);
    expect(res.data.code).toBe("GIVEAWAY_EMPTY");
  });

  it("answers 410 GIVEAWAY_EMPTY when GIVEAWAY_INVITE names no invite", async () => {
    await start({ giveaway: "nosuchid" });
    const res = await post();
    expect(res.status).toBe(410);
    expect(res.data.code).toBe("GIVEAWAY_EMPTY");
  });

  it("ignores a key in the body when the giveaway asks for none", async () => {
    await start();
    const res = await post({ name: "Winner Wanda", key: "anything" });
    expect(res.status).toBe(200);
    expect(res.data.name).toBe("Winner Wanda");
  });

  it("asks each claim for the puzzle key when one is configured", async () => {
    await start({ giveawayKey: KEY, trustProxy: 1 });
    // Missing, non-string, wrong and different-length keys are all refused
    // the same way; each but the missing one counts as a wrong try.
    for (const [i, body] of [{ name: "A" }, { name: "A", key: "nope" }, { name: "A", key: `${KEY}-extra` }, { name: "A", key: 42 }].entries()) {
      const res = await post(body, forwarded(`203.0.113.${i + 1}`));
      expect(res.status, JSON.stringify(body)).toBe(403);
      expect(res.data.code).toBe("GIVEAWAY_KEY");
    }
    // An overlong key is wrong too.
    expect((await post({ key: "x".repeat(65) }, forwarded("203.0.113.9"))).data.code).toBe("GIVEAWAY_KEY");
    // The right key mints.
    const right = await post({ name: "Winner Wanda", key: KEY }, forwarded("203.0.113.1"));
    expect(right.status).toBe(200);
    expect(right.data.url).toBe(`${PUBLIC_URL}/invite/${right.data.code}`);
    expect(invites.list().filter((i) => i.invitedBy === "Carnival")).toHaveLength(1);
  });

  it("refuses a claim without a key but counts no try, since it guesses nothing", async () => {
    await start({ giveawayKey: KEY, trustProxy: 1 });
    // A player who wins before solving the puzzle sends no key.
    for (let i = 0; i < GIVEAWAY_KEY_TRIES + 1; i++) {
      const res = await post({ name: "Early" }, forwarded("203.0.113.7"));
      expect(res.status).toBe(403);
      expect(res.data.code).toBe("GIVEAWAY_KEY");
    }
    expect((await post({ name: "Early", key: KEY }, forwarded("203.0.113.7"))).status).toBe(200);
  });

  it("locks an address out after five wrong keys, but not another", async () => {
    await start({ giveawayKey: KEY, trustProxy: 1 });
    for (let i = 0; i < GIVEAWAY_KEY_TRIES; i++) {
      const res = await post({ key: `wrong-${i}` }, forwarded("203.0.113.5"));
      expect(res.status).toBe(403);
      expect(res.data.code).toBe("GIVEAWAY_KEY");
    }
    // Even the right key is refused now: the tries check runs before the
    // comparison, so a locked-out address learns nothing about further keys.
    const shut = await post({ key: KEY }, forwarded("203.0.113.5"));
    expect(shut.status).toBe(429);
    expect(shut.data.code).toBe("GIVEAWAY_TRIES");
    // Nothing was minted for it, and another address still claims.
    const other = await post({ name: "Other", key: KEY }, forwarded("203.0.113.6"));
    expect(other.status).toBe(200);
    expect(invites.list().filter((i) => i.invitedBy === "Carnival")).toHaveLength(1);
  });

  it("answers GIVEAWAY_LIMIT before the key check when the address minted today", async () => {
    await start({ giveawayKey: KEY, trustProxy: 1 });
    expect((await post({ key: KEY }, forwarded("203.0.113.1"))).status).toBe(200);
    // Even a claim with no key at all gets the limit, not a key error.
    const again = await post({}, forwarded("203.0.113.1"));
    expect(again.status).toBe(429);
    expect(again.data.code).toBe("GIVEAWAY_LIMIT");
  });

  it("answers GIVEAWAY_EMPTY before any key check, recording no try", async () => {
    // The configured sponsor does not exist: the giveaway is empty.
    await start({ giveaway: "nosuchid", giveawayKey: KEY, trustProxy: 1 });
    for (let i = 0; i < GIVEAWAY_KEY_TRIES; i++) {
      const res = await post({ key: `wrong-${i}` }, forwarded("203.0.113.9"));
      expect(res.status).toBe(410);
      expect(res.data.code).toBe("GIVEAWAY_EMPTY");
    }
    // Once the sponsor exists the same address claims at once: none of those
    // wrong keys counted, or it would be locked out already.
    makeSponsor(app!.store, 5, "nosuchid");
    expect((await post({ key: KEY }, forwarded("203.0.113.9"))).status).toBe(200);
  });

  it("takes calls only from the giveaway's own website", async () => {
    await start({ trustProxy: 1 });
    // No Origin header: scripts and curl are allowed, they could forge it anyway.
    expect((await post({ name: "A" }, forwarded("203.0.113.1"))).status).toBe(200);
    // The configured website's browser calls are fine.
    const own = await post({ name: "B" }, { ...forwarded("203.0.113.2"), origin: ORIGIN });
    expect(own.status).toBe(200);
    expect(own.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(own.headers.get("vary")).toBe("origin");
    // Another website's are refused before anything is minted.
    const foreign = await post({ name: "C" }, { ...forwarded("203.0.113.3"), origin: "https://elsewhere.example.com" });
    expect(foreign.status).toBe(403);
    expect(foreign.data.code).toBe("GIVEAWAY_ORIGIN");
    expect(foreign.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(invites.list().filter((i) => i.invitedBy === "Carnival")).toHaveLength(2);
  });

  it("answers OPTIONS /api/giveaway with the giveaway's own CORS headers", async () => {
    await start();
    const res = await fetch(`${base}/api/giveaway`, { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("content-type");
    expect(res.headers.get("vary")).toBe("origin");
    // Every other route keeps the general CORS headers.
    const other = await fetch(`${base}/api/health`, { method: "OPTIONS" });
    expect(other.headers.get("access-control-allow-origin")).toBe("*");
    expect(other.headers.get("access-control-allow-headers")).toBe("authorization, content-type");
  });
});

describe("the Giveaway class", () => {
  it("lets an address mint again once the day has passed", () => {
    let now = 1_000_000_000;
    const store = new Store();
    try {
      const invites = new Invites(store);
      const sponsor = invites.create({ name: "Carnival", quota: 5 });
      const giveaway = new Giveaway(store, invites, { sponsor: sponsor.id, origin: ORIGIN, publicUrl: PUBLIC_URL }, () => now);
      const first = giveaway.claim("198.51.100.7", "Winner", undefined);
      expect(() => giveaway.claim("198.51.100.7", "Winner", undefined)).toThrowError(/already received/);
      now += 24 * 3600_000 + 1_000;
      expect(giveaway.claim("198.51.100.7", "Winner", undefined).code).not.toBe(first.code);
      giveaway.sweep();
    } finally {
      store.db.close();
    }
  });

  it("lets an address try keys again once its wrong-key window has passed", () => {
    let now = 1_000_000_000;
    const store = new Store();
    try {
      const invites = new Invites(store);
      const sponsor = invites.create({ name: "Carnival", quota: 5 });
      const giveaway = new Giveaway(store, invites, { sponsor: sponsor.id, origin: ORIGIN, publicUrl: PUBLIC_URL, key: "open-sesame" }, () => now);
      for (let i = 0; i < GIVEAWAY_KEY_TRIES; i++) {
        expect(() => giveaway.claim("198.51.100.7", "Winner", `wrong-${i}`)).toThrowError(/does not open/);
      }
      expect(() => giveaway.claim("198.51.100.7", "Winner", "open-sesame")).toThrowError(/too many wrong keys/);
      // The window runs a day from the first wrong try; then the count starts
      // over, so a wrong key is refused singly and the right key mints.
      now += 24 * 3600_000 + 1_000;
      expect(() => giveaway.claim("198.51.100.7", "Winner", "still-wrong")).toThrowError(/does not open/);
      expect(giveaway.claim("198.51.100.7", "Winner", "open-sesame").name).toBe("Winner");
      // And sweep forgets windows once they lapse.
      const wrongKeys = (g: Giveaway) => (g as unknown as { wrongKeys: Map<string, unknown> }).wrongKeys;
      now += 24 * 3600_000 + 1_000;
      giveaway.sweep();
      expect(wrongKeys(giveaway).size).toBe(0);
    } finally {
      store.db.close();
    }
  });
});

describe("giveawayConfigFromEnv", () => {
  const env = { GIVEAWAY_INVITE: "k3m9x2", GIVEAWAY_ORIGIN: ORIGIN, PUBLIC_URL };

  it("is null when GIVEAWAY_INVITE is unset or blank", () => {
    expect(giveawayConfigFromEnv({})).toBeNull();
    expect(giveawayConfigFromEnv({ GIVEAWAY_INVITE: "  " })).toBeNull();
  });

  it("reads the settings and strips PUBLIC_URL's trailing slash", () => {
    expect(giveawayConfigFromEnv({ ...env, PUBLIC_URL: "https://play.example.org/" })).toEqual({
      sponsor: "k3m9x2",
      origin: ORIGIN,
      publicUrl: PUBLIC_URL,
    });
  });

  it("rejects a missing or malformed GIVEAWAY_ORIGIN", () => {
    expect(() => giveawayConfigFromEnv({ GIVEAWAY_INVITE: "x", PUBLIC_URL })).toThrow(/GIVEAWAY_ORIGIN/);
    for (const origin of ["https://apps.example.org/path", "https://apps.example.org/", "ftp://apps.example.org", "apps.example.org"]) {
      expect(() => giveawayConfigFromEnv({ ...env, GIVEAWAY_ORIGIN: origin }), origin).toThrow(/GIVEAWAY_ORIGIN/);
    }
  });

  it("needs PUBLIC_URL to build the invite links", () => {
    expect(() => giveawayConfigFromEnv({ GIVEAWAY_INVITE: "x", GIVEAWAY_ORIGIN: ORIGIN })).toThrow(/PUBLIC_URL/);
  });

  it("reads an optional GIVEAWAY_KEY, trimmed; blank means none", () => {
    expect(giveawayConfigFromEnv({ ...env, GIVEAWAY_KEY: "  m8k2-q7X_4  " })).toEqual({ sponsor: "k3m9x2", origin: ORIGIN, publicUrl: PUBLIC_URL, key: "m8k2-q7X_4" });
    expect(giveawayConfigFromEnv(env)).toEqual({ sponsor: "k3m9x2", origin: ORIGIN, publicUrl: PUBLIC_URL });
    expect(giveawayConfigFromEnv({ ...env, GIVEAWAY_KEY: "   " })).toEqual({ sponsor: "k3m9x2", origin: ORIGIN, publicUrl: PUBLIC_URL });
  });

  it("rejects a malformed GIVEAWAY_KEY", () => {
    for (const key of ["abc", "k".repeat(65), "has space", "dots.here", "ünïcode"]) {
      expect(() => giveawayConfigFromEnv({ ...env, GIVEAWAY_KEY: key }), key).toThrow(/GIVEAWAY_KEY/);
    }
  });
});
