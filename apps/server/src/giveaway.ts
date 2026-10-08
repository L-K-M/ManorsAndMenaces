// Giving invites away from a website (GIVEAWAY_INVITE, GIVEAWAY_ORIGIN,
// optional GIVEAWAY_KEY; see docs/invites.md). A page on the operator's own
// site, say a hidden carnival game, hands each winner a personal invite to
// an invite-only server. A static site holds no secrets, so this server
// mints the invite, and anyone can call the endpoint, so two limits keep the
// gift bounded: the sponsor invite's own quota caps the giveaway in total,
// and each client network gets one invite a day. Minted invites are ordinary
// friend invites made by the sponsor: three devices, ten onward invites, and
// `invites list` shows them invited by the sponsor.
//
// When the site's game is a puzzle the operator can also set GIVEAWAY_KEY:
// the site computes a short key from what the player did and sends it with
// the claim, and only the key of the right answer lives here. Anyone can
// read the site's code and compute the key of any answer, so wrong keys are
// limited too, or the answer could be brute-forced.

import { timingSafeEqual } from "node:crypto";
import { isIPv6 } from "node:net";
import type { GiveawayResponse } from "@manors-menaces/protocol";
import type { Invites } from "./invites.js";
import { HttpError } from "./service.js";
import type { InviteRow, Store } from "./store.js";

/** The name on a minted invite when the caller gave none. */
export const GIVEAWAY_DEFAULT_NAME = "Prize winner";

/** Wrong keys a network may send in 24 hours before the giveaway locks it out (429 GIVEAWAY_TRIES). */
export const GIVEAWAY_KEY_TRIES = 5;

/**
 * Wrong keys from everyone together in 24 hours before the giveaway stops
 * checking keys (429 GIVEAWAY_TRIES for all). Networks are cheap to come by,
 * so only this ceiling bounds how fast the answer can be guessed: fifteen
 * thousand orders take weeks at 200 a day. It also bounds the memory wrong
 * tries take. The price: whoever spends it shuts everyone out for the day.
 */
export const GIVEAWAY_WRONG_KEYS_PER_DAY = 200;

/** One minted invite per client network: a fresh chance every day. */
const GIVEAWAY_INTERVAL_MS = 24 * 3600_000;

/** IPv6 groups in a /64, the network of one end site. */
const IPV6_NETWORK_GROUPS = 4;
const IPV6_GROUPS = 8;

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
   * When each client network (networkOf) last minted an invite, for the one-a-day limit.
   * In memory, like the rate limiter: a restart merely lets a winner claim
   * again a little early.
   */
  private readonly mintedAt = new Map<string, number>();

  /**
   * Each network's run of wrong keys: `since` opens its 24 h window at the
   * first wrong try and `count` grows with each; once the window lapses the
   * count starts over. In memory like `mintedAt`.
   */
  private readonly wrongKeys = new Map<string, { count: number; since: number }>();

  /** Everyone's wrong keys together, in the same kind of window, for GIVEAWAY_WRONG_KEYS_PER_DAY. */
  private allWrong = { count: 0, since: 0 };

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
   * invites, and GIVEAWAY_LIMIT when the address's network minted one in the
   * last day.
   * With a key configured the claim's `key` must open the giveaway: an
   * network, or everyone, out of wrong tries gets GIVEAWAY_TRIES, a missing key gets
   * GIVEAWAY_KEY, and any other bad key (not a string, wrong) is recorded and
   * gets GIVEAWAY_KEY. Only a mint and a wrong key are recorded, so a refused
   * caller may try again.
   */
  claim(address: string, name: string, key: unknown): GiveawayResponse {
    const sponsor = this.sponsor();
    if (!sponsor) throw new HttpError(410, "the giveaway has no invites left", "GIVEAWAY_EMPTY");
    const network = networkOf(address);
    const last = this.mintedAt.get(network);
    if (last !== undefined && last > this.now() - GIVEAWAY_INTERVAL_MS) {
      throw new HttpError(429, "this network already received an invite; try again tomorrow", "GIVEAWAY_LIMIT");
    }
    this.checkKey(network, key);
    const invite = this.invites.invite(sponsor, name);
    if (!invite) throw new HttpError(410, "the giveaway has no invites left", "GIVEAWAY_EMPTY");
    this.mintedAt.set(network, this.now());
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
   * comparison, so a network that has used up its tries learns nothing
   * about any further key.
   */
  private checkKey(network: string, key: unknown): void {
    const expected = this.config.key;
    if (expected === undefined) return;
    const now = this.now();
    const cutoff = now - GIVEAWAY_INTERVAL_MS;
    const tries = this.wrongKeys.get(network);
    if (tries && tries.since > cutoff && tries.count >= GIVEAWAY_KEY_TRIES) {
      throw new HttpError(429, "too many wrong keys from this network; try again tomorrow", "GIVEAWAY_TRIES");
    }
    if (this.allWrong.since > cutoff && this.allWrong.count >= GIVEAWAY_WRONG_KEYS_PER_DAY) {
      throw new HttpError(429, "too many wrong keys today; try again tomorrow", "GIVEAWAY_TRIES");
    }
    if (this.keyOpens(key, expected)) return;
    // No key guesses nothing (a player who won before solving the puzzle),
    // so it costs no try.
    if (key === undefined || key === null) throw new HttpError(403, "this giveaway needs the puzzle's key", "GIVEAWAY_KEY");
    if (tries && tries.since > cutoff) tries.count += 1;
    else this.wrongKeys.set(network, { count: 1, since: now });
    if (this.allWrong.since > cutoff) this.allWrong.count += 1;
    else this.allWrong = { count: 1, since: now };
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

/**
 * The network the giveaway's limits count by. An IPv6 end site gets a whole
 * /64 and its devices pick addresses in it at will, so the /64 counts as
 * one: 2001:db8:1:2::a and 2001:db8:1:2::b share their tries. An IPv4
 * address counts alone, written plainly or inside IPv6 (::ffff:192.0.2.7).
 */
function networkOf(address: string): string {
  const plain = address.split("%")[0] ?? address; // drop an IPv6 zone (fe80::1%eth0)
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(plain);
  if (mapped) return mapped[1] as string;
  if (!isIPv6(plain)) return address;
  const [head = "", tail] = plain.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array<string>(IPV6_GROUPS - left.length - right.length).fill("0"), ...right];
  return `${groups.slice(0, IPV6_NETWORK_GROUPS).map((group) => parseInt(group, 16).toString(16)).join(":")}::/64`;
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
