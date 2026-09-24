import { RESOURCE_TYPES, type ResourceCost, type ResourceType, type Resources } from "./types.js";

export function emptyResources(): Resources {
  return { grain: 0, timber: 0, stone: 0, iron: 0, essence: 0 };
}

export function isResourceType(x: unknown): x is ResourceType {
  return typeof x === "string" && (RESOURCE_TYPES as readonly string[]).includes(x);
}

export function addCost(a: ResourceCost, b: ResourceCost): ResourceCost {
  const out: ResourceCost = { ...a };
  for (const r of RESOURCE_TYPES) {
    const v = (a[r] ?? 0) + (b[r] ?? 0);
    if (v !== 0) out[r] = v;
  }
  return out;
}

export function canAfford(have: Resources, cost: ResourceCost): boolean {
  return RESOURCE_TYPES.every((r) => have[r] >= (cost[r] ?? 0));
}

export function totalResources(res: Resources): number {
  return RESOURCE_TYPES.reduce((s, r) => s + res[r], 0);
}

export function costEntries(cost: ResourceCost): [ResourceType, number][] {
  return RESOURCE_TYPES.filter((r) => (cost[r] ?? 0) > 0).map((r) => [r, cost[r] as number]);
}
