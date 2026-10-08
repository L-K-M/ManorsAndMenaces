// Giving invites away from a website (GIVEAWAY_INVITE, GIVEAWAY_ORIGIN,
// optional GIVEAWAY_KEY; see docs/invites.md). A page on the operator's own
// site, say a hidden carnival game, hands each winner a personal invite to
// an invite-only server. A static site holds no secrets, so this server
// mints the invite, and anyone can call the endpoint, so two limits keep the
// gift bounded: the sponsor invite's own quota caps the giveaway in total,
// and each client address gets one invite a day. Minted invites are ordinary
// friend invites made by the sponsor: three devices, ten onward invites, and
// `invites list` shows them invited by the sponsor.
//
// When the site's game is a puzzle the operator can also set GIVEAWAY_KEY:
// the site computes a short key from what the player did and sends it with
// the claim, and only the key of the right answer lives here. Anyone can
// read the site's code and compute the key of any answer, so wrong keys are
// limited too, or the answer could be brute-forced.

import { timingSafeEqual } from "node:crypto";
import type { GiveawayResponse } from "@manors-menaces/protocol";
import type { Invites } from "./invites.js";
import { HttpError } from "./service.js";
import type { InviteRow, Store } from "./store.js";

/** The name on a minted invite when the caller gave none. */
export const GIVEAWAY_DEFAULT_NAME = "Prize winner";

/** Wrong keys an address may send in a day before the giveaway shuts it out (GIVEAWAY_TRIES). */
export const GIVEAWAY_KEY_TRIES = 5;

/** One minted invite per client address: a fresh chance every day. */
const GIVEAWAY_INTERVAL_MS = 24 * 3600_000;

/** A key is a short token the website computes for an answer: 4 to 64 of letters, digits, - and _. */
const GIVEAWAY_KEY_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;
const GIVEAWAY_KEY_MAX = 64;

export interface GiveawayConfig {
  /** Id of the sponsor invite that mints (GIVEAWAY_INVITE). */
  sponsor: string;
  /** The one website origin a browser may call the giveaway from (GIVEAWAY_ORIGIN). */
  origin: string;
  /** Where winners open their invite link, without a trailing slash (PUBLIC_URL). */
  publicUrl: string;
  /** The puzzle key every claim must carry (GIVEAWAY_KEY); absent: no key needed. */
  key?: string;
}

/**
 * The giveaway's settings from the environment: null when GIVEAWAY_INVITE is
 * not set. Throws a message naming the setting to fix.
 */
export function giveawayConfigFromEnv(env: NodeJS.ProcessEnv): GiveawayConfig | null {
  const sponsor = env.GIVEAWAY_INVITE?.trim() ?? "";
  if (!sponsor) return null;
  const origin = env.GIVEAWAY_ORIGIN?.trim() ?? "";
  if (!origin) {
    throw new Error("GIVEAWAY_INVITE is set, so the giveaway needs GIVEAWAY_ORIGIN: the one website allowed to call it, like https://apps.example.org");
  }
  // A URL's .origin is scheme + host + port: if the text is anything more (a
  // path, a query, a trailing slash) the two differ, and it is no bare origin.
  const parsed = parseUrl(origin);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin !== origin) {
    throw new Error(`GIVEAWAY_ORIGIN must be a bare http(s) origin (scheme, host, optional port; no path or trailing slash), like https://apps.example.org, not "${env.GIVEAWAY_ORIGIN}"`);
  }
  const publicUrl = env.PUBLIC_URL?.trim() ?? "";
  if (!publicUrl) {
    throw new Error("GIVEAWAY_INVITE is set, so the giveaway needs PUBLIC_URL: where winners open their invite links, like https://play.example.org");
  }
  const key = env.GIVEAWAY_KEY?.trim() ?? "";
  if (key && !GIVEAWAY_KEY_PATTERN.test(key)) {
    throw new Error(`GIVEAWAY_KEY must be 4 to 64 characters of letters, digits, "-" or "_" (the website's tool computes it from the right answer), not "${env.GIVEAWAY_KEY}"`);
  }
  return { sponsor, origin, publicUrl: publicUrl.replace(/\/+$/, ""), ...(key ? { key } : {}) };
}

/**
 * The giveaway itself: POST /api/giveaway mints one invite per call as one of
 * the sponsor's own friend invites (Invites.invite), so the sponsor's quota
 * is the giveaway's total cap.
 */
export class Giveaway {
  /**
   * When each client address last minted an invite, for the one-a-day limit.
   * In memory, like the rate limiter: a restart merely lets a winner claim
   * again a little early.
   */
  private readonly mintedAt = new Map<string, number>();

  /**
   * Each address's run of wrong keys: `since` opens its 24 h window at the
   * first wrong try and `count` grows with each; once the window lapses the
   * count starts over. In memory like `mintedAt`.
   */
  private readonly wrongKeys = new Map<string, { count: number; since: number }>();

  constructor(
    private readonly store: Store,
    private readonly invites: Invites,
    private readonly config: GiveawayConfig,
    private readonly now: () => number = Date.now,
  ) {}

  /** The website a browser may call the giveaway from (GIVEAWAY_ORIGIN). */
  get origin(): string {
    return this.config.origin;
  }

  /**
   * Mints an invite for `address` named `name` and returns its link. Throws
   * GIVEAWAY_EMPTY when the sponsor is unknown, revoked or has made all its
   * invites, and GIVEAWAY_LIMIT when the address minted one in the last day.
   * With a key configured the claim's `key` must open the giveaway: an
   * address out of wrong tries gets GIVEAWAY_TRIES, a missing key gets
   * GIVEAWAY_KEY, and any other bad key (not a string, wrong) is recorded and
   * gets GIVEAWAY_KEY. Only a mint and a wrong key are recorded, so a refused
   * caller may try again.
   */
  claim(address: string, name: string, key: unknown): GiveawayResponse {
    const sponsor = this.sponsor();
    if (!sponsor) throw new HttpError(410, "the giveaway has no invites left", "GIVEAWAY_EMPTY");
    const last = this.mintedAt.get(address);
    if (last !== undefined && last > this.now() - GIVEAWAY_INTERVAL_MS) {
      throw new HttpError(429, "this address already received an invite; try again tomorrow", "GIVEAWAY_LIMIT");
    }
    this.checkKey(address, key);
    const invite = this.invites.invite(sponsor, name);
    if (!invite) throw new HttpError(410, "the giveaway has no invites left", "GIVEAWAY_EMPTY");
    this.mintedAt.set(address, this.now());
    return { url: `${this.config.publicUrl}/invite/${invite.code}`, code: invite.code, name: invite.name };
  }

  /** Forgets mints and wrong-key windows older than a day; the app's 30 s sweep calls this so the maps stay bounded. */
  sweep(): void {
    const cutoff = this.now() - GIVEAWAY_INTERVAL_MS;
    for (const [address, at] of this.mintedAt) if (at <= cutoff) this.mintedAt.delete(address);
    for (const [address, tries] of this.wrongKeys) if (tries.since <= cutoff) this.wrongKeys.delete(address);
  }

  /**
   * The key gate, when a key is configured. The tries check runs before the
   * comparison, so an address that has used up its tries learns nothing
   * about any further key.
   */
  private checkKey(address: string, key: unknown): void {
    const expected = this.config.key;
    if (expected === undefined) return;
    const now = this.now();
    const cutoff = now - GIVEAWAY_INTERVAL_MS;
    const tries = this.wrongKeys.get(address);
    if (tries && tries.since > cutoff && tries.count >= GIVEAWAY_KEY_TRIES) {
      throw new HttpError(429, "too many wrong keys from this address; try again tomorrow", "GIVEAWAY_TRIES");
    }
    if (this.keyOpens(key, expected)) return;
    // No key guesses nothing (a player who won before solving the puzzle),
    // so it costs no try.
    if (key === undefined || key === null) throw new HttpError(403, "this giveaway needs the puzzle's key", "GIVEAWAY_KEY");
    if (tries && tries.since > cutoff) tries.count += 1;
    else this.wrongKeys.set(address, { count: 1, since: now });
    throw new HttpError(403, "this key does not open the giveaway", "GIVEAWAY_KEY");
  }

  /**
   * Whether `key` is the configured one, compared in constant time; anything
   * else (a non-string, an overlong or different-length key) is simply wrong.
   */
  private keyOpens(key: unknown, expected: string): boolean {
    if (typeof key !== "string" || key.length > GIVEAWAY_KEY_MAX) return false;
    const given = Buffer.from(key);
    const want = Buffer.from(expected);
    return given.length === want.length && timingSafeEqual(given, want);
  }

  /** The sponsor invite while it can still mint: it exists, is not revoked, and has invites left to make. */
  private sponsor(): InviteRow | null {
    const sponsor = this.store.invite(this.config.sponsor);
    if (!sponsor || sponsor.revoked_at) return null;
    return this.store.invitesMadeBy(sponsor.id).length < sponsor.quota ? sponsor : null;
  }
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
