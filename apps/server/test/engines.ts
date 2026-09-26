import { rulesContentFor } from "@manors-menaces/content";
import { createRulesEngine, type RulesEngine } from "@manors-menaces/rules";

const engines = new Map<string, RulesEngine>();

/** A rules engine for a match's map: each new match draws its own island and layout. */
export function engineFor(mapId: string): RulesEngine {
  let engine = engines.get(mapId);
  if (!engine) {
    engine = createRulesEngine(rulesContentFor(mapId));
    engines.set(mapId, engine);
  }
  return engine;
}
