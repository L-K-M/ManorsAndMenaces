import { GREENVALE_MAP, mapById, rulesContentFor, type MapDefinition } from "@manors-menaces/content";
import { createRulesEngine, type RulesContent, type RulesEngine } from "@manors-menaces/rules";

// One engine per rules content object: content drops out of its bounded cache
// once no game has used its map for a while, and its engine goes with it.
const engines = new WeakMap<RulesContent, RulesEngine>();

export function engineFor(mapId: string = GREENVALE_MAP.id): RulesEngine {
  const content = rulesContentFor(mapId);
  let e = engines.get(content);
  if (!e) {
    e = createRulesEngine(content);
    engines.set(content, e);
  }
  return e;
}

export function mapFor(mapId: string = GREENVALE_MAP.id): MapDefinition {
  const m = mapById(mapId);
  if (!m) throw new Error(`Unknown map ${mapId}`);
  return m;
}
