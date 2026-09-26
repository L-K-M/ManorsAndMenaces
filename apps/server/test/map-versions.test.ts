import { afterEach, beforeEach, expect, it } from "vitest";
import { ISLANDS, LEGACY_GREENVALE_MAP, parseMapId, rulesContentFor } from "@manors-menaces/content";
import { RULESET_VERSION, createRulesEngine, getLegalActions, mvpRuleset, type GameCommand } from "@manors-menaces/rules";
import { Store } from "../src/store.js";
import { MatchService } from "../src/service.js";

let store: Store;
let service: MatchService;
beforeEach(() => { store = new Store(); service = new MatchService(store); });
afterEach(() => { service.shutdown(); store.db.close(); });

it("starts and replays saved lobbies with their original map while new matches draw a layout of an island", () => {
  const alice = service.authenticate(service.createGuest("Alice").token);
  const bob = service.authenticate(service.createGuest("Bob").token);
  const legacyId = "legacy";
  store.createMatch({ id: legacyId, ruleset: mvpRuleset(), rulesVersion: RULESET_VERSION, mapId: "greenvale", seed: "coast", inviteCode: "LEGACY" });
  for (let seat = 0; seat < 2; seat++) store.addSeat({ match_id: legacyId, seat, player_id: `P${seat + 1}`, user_id: seat === 0 ? alice.id : null, display_name: seat === 0 ? "Alice" : "Bob", kind: "human", ai_level: null });
  service.joinMatch(bob, "LEGACY", "Bob");
  const modern = service.createMatch(alice, { seatCount: 2, rulesetName: "mvp", displayName: "Alice" });
  service.joinMatch(bob, modern.inviteCode, "Bob");
  const drawn = parseMapId(store.match(modern.matchId)!.map_id);
  expect(drawn?.layout).not.toBeNull();
  expect(ISLANDS.map((i) => i.id)).toContain(drawn?.islandId);
  // A Site the new board has and the old one lacks: legal on one, unknown on the other.
  const modernState = store.match(modern.matchId)!.state!;
  const modernEngine = createRulesEngine(rulesContentFor(store.match(modern.matchId)!.map_id));
  const legacySites = new Set(LEGACY_GREENVALE_MAP.sites.map((s) => s.id));
  const newSite = getLegalActions(modernEngine.ctx, modernState, modernState.activePlayerId).initialManorSites.find((id) => !legacySites.has(id));
  expect(newSite).toBeDefined();
  for (const matchId of [legacyId, modern.matchId]) {
    const match = store.match(matchId)!;
    const state = match.state!;
    const user = state.activePlayerId === "P1" ? alice : bob;
    const command: GameCommand = { type: "place_initial_manor", siteId: newSite!, commandId: "new-site", matchId, playerId: state.activePlayerId };
    expect(service.submit(user, { matchId, expectedRevision: state.revision, commands: [command] }).accepted).toBe(matchId !== legacyId);
    if (matchId === legacyId) {
      const engine = createRulesEngine(rulesContentFor("greenvale"));
      const siteId = getLegalActions(engine.ctx, state, state.activePlayerId).initialManorSites[0]!;
      expect(service.submit(user, { matchId, expectedRevision: state.revision, commands: [{ ...command, commandId: "old-site", siteId }] }).accepted).toBe(true);
    }
    expect(service.history(matchId, user).complete).toBe(true);
    expect(service.history(matchId, user).entries).toHaveLength(1);
  }
});
