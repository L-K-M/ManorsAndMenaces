// The cards other players played, waiting for the viewer to read them whole
// and tap OK (PlayedCardDialog). Kept apart from FeedbackController, whose
// effects never feed back into play: while a card waits here on screen,
// local computer players hold their next move (GameSession.holdAi). Online
// computer players do not wait; the server paces them and this queues.
//
// Who reads what: online, this client's seat. In a hot-seat game, each human
// reads what the others played since they last held the device, once they
// reveal their view; nothing shows on the neutral screen of a computer's
// turn. Otherwise (one human, or the curtain off) whoever is viewing reads.
//
// With the "Pause to show other players' cards" setting off, nothing waits:
// others' plays show as toasts and the card flourish (CardMagic), as before.

import type { SeatConfig } from "@manors-menaces/protocol";
import type { PlayerId } from "@manors-menaces/rules";
import type { EventBus } from "./eventBus.js";
import { playNoticesFor, reactionAskedOf, type PlayNotice } from "./plays.js";
import { PrivacyMode } from "./privacy.js";
import { settings } from "../stores/settings.svelte.js";
import type { SessionEvents } from "./session.svelte.js";

/** What the queue needs from the game session (GameSession provides it). */
export interface PlaySession {
  readonly events: EventBus<SessionEvents>;
  readonly viewerId: PlayerId | null;
  readonly curtainFor: PlayerId | null;
  readonly onlinePlayerId: PlayerId | null;
  readonly seats: readonly SeatConfig[];
  readonly transport: { readonly kind: "local" | "online" };
  /** Online: the cards played while this player was away, to read first. */
  readonly missedPlays: readonly PlayNotice[];
  privacyMode(): PrivacyMode;
  holdAi(held: () => boolean): () => void;
  resumeAi(): void;
}

export class PlayQueue {
  // Replaced on every change, never mutated, so plain data suffices.
  /** Per human seat: the notices they have not read yet, oldest first. */
  private waiting: Record<PlayerId, readonly PlayNotice[]> = $state.raw({});
  /** Per human seat: how many they have read since their queue was last empty ("2 of 5"). */
  private read: Record<PlayerId, number> = $state.raw({});

  private readonly session: PlaySession;
  private readonly unsubscribe: () => void;
  private readonly releaseHold: () => void;
  private destroyed = false;

  constructor(session: PlaySession) {
    this.session = session;
    if (settings.pauseOnCardPlay && session.onlinePlayerId && session.missedPlays.length) this.waiting = { [session.onlinePlayerId]: [...session.missedPlays] };
    this.unsubscribe = session.events.on((m) => {
      if (m.provisional) return;
      // After the session has updated the view for the batch (it publishes first).
      queueMicrotask(() => this.receive(m));
    });
    this.releaseHold = session.holdAi(() => this.current !== null);
  }

  destroy(): void {
    this.destroyed = true;
    this.unsubscribe();
    this.releaseHold();
  }

  /** The card on screen now: the viewer's oldest unread one, unless the curtain is up. */
  get current(): PlayNotice | null {
    const viewer = this.session.viewerId;
    if (!settings.pauseOnCardPlay || !viewer || this.session.curtainFor) return null;
    return this.waiting[viewer]?.[0] ?? null;
  }

  /** Which of the viewer's cards is on screen, counting from 1. */
  get position(): number {
    return (this.read[this.session.viewerId ?? ""] ?? 0) + 1;
  }

  /** The viewer's cards read and waiting in this run. */
  get total(): number {
    const viewer = this.session.viewerId ?? "";
    return (this.read[viewer] ?? 0) + (this.waiting[viewer]?.length ?? 0);
  }

  /** The viewer has read the current card: show the next, or let play go on. */
  acknowledge(): void {
    const viewer = this.session.viewerId;
    if (!this.current || !viewer) return;
    const rest = (this.waiting[viewer] ?? []).slice(1);
    this.waiting = { ...this.waiting, [viewer]: rest };
    this.read = { ...this.read, [viewer]: rest.length ? (this.read[viewer] ?? 0) + 1 : 0 };
    this.session.resumeAi();
  }

  /** The pause was switched off: forget every card waiting and let play go on. */
  release(): void {
    this.waiting = {};
    this.read = {};
    this.session.resumeAi();
  }

  private receive(m: SessionEvents): void {
    if (this.destroyed || !settings.pauseOnCardPlay) return;
    let waiting = this.waiting;
    for (const playerId of this.readers()) {
      const asked = reactionAskedOf(m.state, playerId);
      // A Spell this player is now asked to answer shows in that dialog instead.
      const kept = (waiting[playerId] ?? []).filter((n) => n.cardId !== asked);
      waiting = { ...waiting, [playerId]: [...kept, ...playNoticesFor(m.events, m.state, playerId)] };
    }
    this.waiting = waiting;
  }

  /** The humans a batch is news to (see the top of this file). */
  private readers(): PlayerId[] {
    const s = this.session;
    if (s.transport.kind === "online") return s.onlinePlayerId ? [s.onlinePlayerId] : [];
    if (s.privacyMode() === PrivacyMode.HotSeat) return s.seats.filter((seat) => seat.kind === "human").map((seat) => seat.playerId);
    return s.viewerId ? [s.viewerId] : [];
  }
}
