import { GREENVALE_MAP, MAPS, rulesContentFor, type MapDefinition } from "@manors-menaces/content";
import { createRulesEngine, type RulesEngine } from "@manors-menaces/rules";

const engines = new Map<string, RulesEngine>();

export function engineFor(mapId: string = GREENVALE_MAP.id): RulesEngine {
  let e = engines.get(mapId);
  if (!e) {
    e = createRulesEngine(rulesContentFor(mapId));
    engines.set(mapId, e);
  }
  return e;
}

export function mapFor(mapId: string = GREENVALE_MAP.id): MapDefinition {
  const m = MAPS[mapId];
  if (!m) throw new Error(`Unknown map ${mapId}`);
  return m;
}
