// "What just happened?" (spec §50, §56.1): turns the session's event batches
// into harvest flights, Menace badges, board pulses, action toasts and the
// catch-up digest. Presentation only; nothing here feeds back into play.
//
// Hot-seat: a batch that arrives while the privacy curtain is up belongs to
// the player about to take the device. Their harvest is held back and
// played when they reveal; everything else waits in the digest.

import { tick } from "svelte";
import type { GameEvent, HarvestNote, PlayerId, ResourceType } from "@manors-menaces/rules";
import { animationScale } from "../stores/settings.svelte.js";
import { clearIncoming, holdIncoming, releaseIncoming } from "../stores/fx.svelte.js";
import { awayDigest, feedItemsFor, type FeedBatch, type FeedItem } from "./feed.js";
import { planHarvestFlights, resourceKey, type Flight, type HarvestBadge, type Point } from "./harvestFlights.js";
import type { GameSession, SessionEvents } from "./session.svelte.js";

/** Toasts on screen at once; older ones make way. */
const MAX_TOASTS = 3;
/** Reading time for a toast; not scaled by animation speed. */
const TOAST_MS = 5000;
const PULSE_MS = 1600;
const BADGE_MS = 2600;
const FLIGHT_MS = 640;
const FLIGHT_STAGGER_MS = 90;
/** A token that never reports landing (element gone) is released after this. */
const FLIGHT_GRACE_MS = 800;
/** Batches kept for the digest; far more than one round of play. */
const HISTORY_LIMIT = 80;

export interface Toast extends FeedItem {
  key: string;
}

export interface Pulse {
  key: string;
  at: Point;
  actorId: PlayerId | null;
}

export interface Badge {
  key: string;
  at: Point;
  note: HarvestNote;
}

export interface Token {
  key: string;
  playerId: PlayerId;
  resource: ResourceType;
  from: Point;
  delay: number;
  duration: number;
}

export interface Digest {
  viewerId: PlayerId;
  items: FeedItem[];
}

interface Held {
  flights: Flight[];
  badges: HarvestBadge[];
  toasts: FeedItem[];
}

let nextKey = 1;

export class FeedbackController {
  toasts: Toast[] = $state([]);
  digest: Digest | null = $state(null);
  pulses: Pulse[] = $state([]);
  badges: Badge[] = $state([]);
  tokens: Token[] = $state([]);

  private readonly session: GameSession;
  private readonly unsubscribe: () => void;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private batches: FeedBatch[] = [];
  private seq = 0;
  /** Per player: the last batch their digest covered. */
  private readonly caughtUp = new Map<PlayerId, number>();
  /** Behind the curtain: what the next player sees when they reveal. */
  private held: Held = { flights: [], badges: [], toasts: [] };
  private control: PlayerId | null = null;
  private destroyed = false;

  constructor(session: GameSession) {
    this.session = session;
    clearIncoming();
    this.unsubscribe = session.events.on((m) => {
      // Hold the tokens back at once, before the counters render the new
      // totals, so a counter never shows its new value before its tokens land.
      const plan = planHarvestFlights(m.own && !m.provisional ? withoutStartingResources(m.events) : m.events, session.map);
      const flights = animationScale() > 0 ? plan.flights : [];
      for (const f of flights) holdIncoming(resourceKey(f.playerId, f.resource));
      // The rest waits: the session raises the curtain for the next player
      // right after publishing the batch that ended the previous turn.
      queueMicrotask(() => this.receive(m, flights, plan.badges));
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubscribe();
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    clearIncoming();
  }

  /** The local player to act changed (their turn, a reaction, a reveal). */
  controlChanged(actor: PlayerId | null): void {
    // After the batch that handed over control has been received.
    this.later(0, () => this.takeControl(actor));
  }

  /** The curtain came down: play what the revealed player was dealt. */
  revealed(): void {
    const held = this.held;
    this.held = { flights: [], badges: [], toasts: [] };
    // Let the board lay out under the lifted curtain first.
    this.later(120, () => {
      this.addToasts(held.toasts);
      void this.launch(held.flights, held.badges);
    });
  }

  dismissDigest(): void {
    this.digest = null;
  }

  landed(token: Token): void {
    if (!this.tokens.some((t) => t.key === token.key)) return;
    this.tokens = this.tokens.filter((t) => t.key !== token.key);
    releaseIncoming(resourceKey(token.playerId, token.resource));
  }

  // ------------------------------------------------------------------ batches

  /** `flights` are already held as incoming; each is launched or released. */
  private receive(m: SessionEvents, flights: Flight[], badges: HarvestBadge[]): void {
    if (this.destroyed) return;
    if (m.provisional || m.own) this.digest = null;
    if (m.provisional) {
      void this.launch(flights, badges);
      return;
    }

    const curtain = this.session.curtainFor;
    const watching = curtain ? null : this.session.viewerId;
    this.remember(m, watching);
    if (curtain) {
      // Only the player about to take the device will see these.
      const mine = (x: { playerId: PlayerId }) => x.playerId === curtain;
      for (const f of flights) if (!mine(f)) releaseIncoming(resourceKey(f.playerId, f.resource));
      this.held.flights.push(...flights.filter(mine));
      this.held.badges.push(...badges.filter(mine));
      this.held.toasts.push(...feedItemsFor(m.events, m.state, this.session.map, curtain).filter((i) => i.self));
      return;
    }

    const items = feedItemsFor(m.events, m.state, this.session.map, watching);
    this.addToasts(items);
    this.addPulses(items);
    void this.launch(flights, badges);
  }

  private remember(m: SessionEvents, watching: PlayerId | null): void {
    this.seq += 1;
    this.batches.push({ seq: this.seq, events: m.events, state: m.state, seenBy: new Set(watching ? [watching] : []) });
    if (this.batches.length > HISTORY_LIMIT) this.batches = this.batches.slice(-HISTORY_LIMIT);
  }

  private takeControl(actor: PlayerId | null): void {
    if (this.destroyed || actor === this.control) return;
    this.control = actor;
    if (!actor) return;
    const digest = awayDigest(this.batches, this.session.map, actor, this.caughtUp.get(actor) ?? 0);
    this.caughtUp.set(actor, this.seq);
    if (!digest) return;
    // The toasts collapse into the digest, which lists them too.
    this.toasts = this.toasts.filter((t) => t.self);
    this.digest = { viewerId: actor, items: digest };
  }

  // ------------------------------------------------------------------ effects

  private addToasts(items: FeedItem[]): void {
    if (!items.length) return;
    const fresh = items.map((i) => ({ ...i, key: `toast-${nextKey++}` }));
    this.toasts = [...this.toasts, ...fresh].slice(-MAX_TOASTS);
    for (const toast of fresh) this.later(TOAST_MS, () => (this.toasts = this.toasts.filter((t) => t.key !== toast.key)));
  }

  private addPulses(items: FeedItem[]): void {
    const fresh = items.filter((i): i is FeedItem & { at: Point } => i.at !== null).map((i) => ({ key: `pulse-${nextKey++}`, at: i.at, actorId: i.actorId }));
    if (!fresh.length) return;
    this.pulses = [...this.pulses, ...fresh];
    const keys = new Set(fresh.map((p) => p.key));
    this.later(PULSE_MS, () => (this.pulses = this.pulses.filter((p) => !keys.has(p.key))));
  }

  /** Put held tokens in the air and badges on their Regions. */
  private async launch(flights: Flight[], badges: HarvestBadge[]): Promise<void> {
    const scale = animationScale();
    if (badges.length) {
      const fresh = badges.map((b) => ({ key: `badge-${nextKey++}`, at: b.at, note: b.note }));
      this.badges = [...this.badges, ...fresh];
      const keys = new Set(fresh.map((b) => b.key));
      this.later(BADGE_MS, () => (this.badges = this.badges.filter((b) => !keys.has(b.key))));
    }
    // Animation was switched off meanwhile: just let the counters catch up.
    if (scale === 0 || !flights.length) {
      for (const f of flights) releaseIncoming(resourceKey(f.playerId, f.resource));
      return;
    }

    const tokens = flights.map((f) => ({
      key: `token-${nextKey++}`,
      playerId: f.playerId,
      resource: f.resource,
      from: f.from,
      delay: f.order * FLIGHT_STAGGER_MS * scale,
      duration: FLIGHT_MS * scale,
    }));
    // Let the toasts the tokens may land in render first.
    await tick();
    if (this.destroyed) return;
    this.tokens = [...this.tokens, ...tokens];
    for (const token of tokens) this.later(token.delay + token.duration + FLIGHT_GRACE_MS, () => this.landed(token));
  }

  private later(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.add(id);
  }
}

/** Starting resources this client already flew when it buffered the Manor. */
function withoutStartingResources(events: GameEvent[]): GameEvent[] {
  return events.filter((e) => !(e.type === "resource_gained" && e.reason === "starting_resources"));
}
