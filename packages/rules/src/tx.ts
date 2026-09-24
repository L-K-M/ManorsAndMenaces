// Transaction helpers. The engine clones the input state once per command and
// mutates the clone through these helpers, so callers never see mutation
// (spec §36 "controlled structural cloning").

import { own } from "./clone.js";
import type { RulesContext } from "./context.js";
import { check } from "./errors.js";
import type { GameEvent, ResourceReason } from "./events.js";
import { costEntries } from "./resources.js";
import { createRng, type GameRng } from "./rng.js";
import { locationAffectsPlayer } from "./selectors.js";
import type { CardId, GameState, MenaceInstance, MenaceLocation, PlayerId, PlayerState, ResourceCost, ResourceType } from "./types.js";

export class Tx {
  readonly events: GameEvent[] = [];
  private rngInstance: GameRng | null = null;

  constructor(
    readonly ctx: RulesContext,
    readonly s: GameState,
  ) {}

  emit(e: GameEvent): void {
    this.events.push(e);
  }

  get rng(): GameRng {
    this.rngInstance ??= createRng(this.s.rngState);
    return this.rngInstance;
  }

  /** Persist RNG progress into the state. Called once when committing. */
  commit(): void {
    if (this.rngInstance) this.s.rngState = this.rngInstance.state;
  }

  player(id: PlayerId): PlayerState {
    const p = own(this.s.players, id);
    check(p, "UNKNOWN_ENTITY", `player ${id}`);
    return p;
  }

  gain(playerId: PlayerId, resource: ResourceType, amount: number, reason: ResourceReason): void {
    if (amount <= 0) return;
    this.player(playerId).resources[resource] += amount;
    this.emit({ type: "resource_gained", playerId, resource, amount, reason });
  }

  /** Spend a cost, failing with INSUFFICIENT_RESOURCES if unaffordable. */
  spend(playerId: PlayerId, cost: ResourceCost, reason: ResourceReason): void {
    const p = this.player(playerId);
    for (const [r, n] of costEntries(cost)) check(p.resources[r] >= n, "INSUFFICIENT_RESOURCES", `${r} ${p.resources[r]}/${n}`);
    for (const [r, n] of costEntries(cost)) {
      p.resources[r] -= n;
      this.emit({ type: "resource_spent", playerId, resource: r, amount: n, reason });
    }
  }

  transfer(from: PlayerId, to: PlayerId, resource: ResourceType, amount: number, reason: ResourceReason): void {
    const a = this.player(from);
    const b = this.player(to);
    check(a.resources[resource] >= amount, "INSUFFICIENT_RESOURCES", `${resource}`);
    a.resources[resource] -= amount;
    b.resources[resource] += amount;
    this.emit({ type: "resource_transferred", fromPlayerId: from, toPlayerId: to, resource, amount, reason });
  }

  /** Move a Menace and update the mover's statistics. */
  moveMenace(by: PlayerId | null, menace: MenaceInstance, to: MenaceLocation): void {
    const from = menace.location;
    if (by) {
      const p = this.player(by);
      p.stats.menacesMoved += 1;
      if (locationAffectsPlayer(this.s, from, by)) p.stats.menacesMovedOffOwnAssets += 1;
    }
    menace.location = to;
    this.emit({ type: "menace_moved", byPlayerId: by, menaceId: menace.id, from, to });
  }

  /** Draw the top card, reshuffling the discard pile if the deck is empty (§117). */
  drawCard(): CardId | null {
    if (this.s.cardDeck.length === 0 && this.s.discardPile.length > 0) {
      this.s.cardDeck = this.rng.shuffle(this.s.discardPile);
      this.s.discardPile = [];
      this.emit({ type: "deck_reshuffled", size: this.s.cardDeck.length });
    }
    return this.s.cardDeck.shift() ?? null;
  }

  discard(cardId: CardId): void {
    this.s.discardPile.push(cardId);
  }
}
