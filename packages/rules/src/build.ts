// Building (§12–13): paying for a build and founding a Holding. Shared by the
// build commands and The Dowager (§19.28), which builds a Manor as a card.

import { BALANCE } from "./balance.js";
import { check, RuleViolation } from "./errors.js";
import type { ResourceReason } from "./events.js";
import { isResourceType } from "./resources.js";
import { totalBuildCost, type BuildCheck } from "./selectors.js";
import type { Tx } from "./tx.js";
import { RESOURCE_TYPES, type BannerId, type HoldingId, type PlayerId, type PlayerState, type ResourceCost, type ResourceType, type SiteId } from "./types.js";

/** What a build pays: its price, and the toll and surcharge chosen in the command. */
export interface BuildPayment {
  cost: ResourceCost;
  toll?: ResourceType;
  surcharge?: ResourceType;
}

/**
 * Checks a build's payment without changing anything: the build must be
 * legal, the toll and surcharge given exactly when due, and the player able
 * to pay it all. Throws a RuleViolation otherwise.
 */
export function checkBuildPayment(player: PlayerState, build: BuildCheck, toll: unknown, surcharge: unknown): BuildPayment {
  if (!build.legal) throw new RuleViolation(build.reason);
  if (build.needsToll) check(isResourceType(toll), "INVALID_PAYMENT", "toll required (Highwayman)");
  else check(toll === undefined, "INVALID_PAYMENT", "no toll is due");
  if (build.needsSurcharge) check(isResourceType(surcharge), "INVALID_PAYMENT", "Goblin Tinkers surcharge required");
  else check(surcharge === undefined, "INVALID_PAYMENT", "no surcharge is due");
  const payment: BuildPayment = {
    cost: build.cost,
    ...(build.needsToll ? { toll: toll as ResourceType } : {}),
    ...(build.needsSurcharge ? { surcharge: surcharge as ResourceType } : {}),
  };
  const total = totalBuildCost(build, payment.toll, payment.surcharge);
  for (const r of RESOURCE_TYPES) check(player.resources[r] >= (total[r] ?? 0), "INSUFFICIENT_RESOURCES", r);
  return payment;
}

export function payForBuild(tx: Tx, playerId: PlayerId, build: BuildCheck, toll: unknown, surcharge: unknown, reason: Extract<ResourceReason, "build_route" | "build_manor" | "upgrade_holding">): void {
  const payment = checkBuildPayment(tx.player(playerId), build, toll, surcharge);
  tx.spend(playerId, payment.cost, reason);
  if (payment.toll) tx.spend(playerId, { [payment.toll]: BALANCE.costs.toll }, "toll");
  if (payment.surcharge) tx.spend(playerId, { [payment.surcharge]: BALANCE.costs.goblinSurcharge }, "goblin_tinkers");
}

/** A new Manor on the Site with its Banner at home. `dowerHouse` marks The Dowager's (§19.28). */
export function createHolding(tx: Tx, playerId: PlayerId, siteId: SiteId, opts: { dowerHouse?: boolean } = {}): HoldingId {
  const s = tx.s;
  const id = `holding_${s.nextIds.holding++}`;
  s.holdings[id] = { id, siteId, ownerId: playerId, type: "manor", ...(opts.dowerHouse ? { dowerHouse: true as const } : {}) };
  tx.player(playerId).holdingIds.push(id);
  createBanner(tx, playerId, id);
  return id;
}

export function createBanner(tx: Tx, playerId: PlayerId, holdingId: HoldingId): BannerId {
  const s = tx.s;
  const id = `banner_${s.nextIds.banner++}`;
  s.banners[id] = { id, ownerId: playerId, holdingId, regionId: null, settled: false };
  tx.emit({ type: "banner_created", playerId, bannerId: id, holdingId });
  return id;
}
