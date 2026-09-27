import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isWellFormedCommand, type CreateMatchRequest } from "@manors-menaces/protocol";
import { HIDDEN_CHARGE, type GameState, type PlayerId } from "@manors-menaces/rules";
import { actorOf } from "../src/notices.js";
import { Store, type UserRow } from "../src/store.js";
import { HttpError, MatchService } from "../src/service.js";

// Sealed Charges (spec §27A) are a lobby option. The server checks it when a
// match is created, deals the Charges, and shows each player only their own
// (§105): rivals see that a Charge is held, and how many are in the deck.

let store: Store;
let service: MatchService;
let alice: UserRow;
let bob: UserRow;
beforeEach(() => {
  store = new Store();
  service = new MatchService(store, { aiDelayMs: 5 });
  alice = service.authenticate(service.createGuest("Alice").token);
  bob = service.authenticate(service.createGuest("Bob").token);
});
afterEach(() => {
  service.shutdown();
  store.db.close();
});

function create(req: Record<string, unknown>) {
  return service.createMatch(alice, { displayName: "Alice", seatCount: 2, rulesetName: "standard", ...req } as CreateMatchRequest);
}

function refusal(req: Record<string, unknown>): HttpError | undefined {
  try {
    create(req);
  } catch (e) {
    if (e instanceof HttpError) return e;
    throw e;
  }
  return undefined;
}

/** A started two-player match with the option on, and each player's user. */
function started() {
  const { matchId, inviteCode } = create({ sealedCharges: true });
  service.joinMatch(bob, inviteCode, "Bob");
  const users: Record<PlayerId, UserRow> = { [service.view(matchId, alice).youAre as PlayerId]: alice, [service.view(matchId, bob).youAre as PlayerId]: bob };
  return { matchId, users };
}

const stateOf = (matchId: string, user: UserRow): GameState => service.view(matchId, user).state as GameState;

async function until(check: () => boolean, ms = 2_000): Promise<boolean> {
  for (const end = Date.now() + ms; Date.now() < end; ) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return check();
}

describe("creating a match with Sealed Charges", () => {
  it("stores the option, and leaves it out when off or not sent", () => {
    for (const rulesetName of ["standard", "async", "mvp"]) expect(service.view(create({ rulesetName, sealedCharges: true }).matchId, alice).ruleset.sealedCharges).toBe(true);
    expect(service.view(create({ sealedCharges: false }).matchId, alice).ruleset).not.toHaveProperty("sealedCharges");
    expect(service.view(create({}).matchId, alice).ruleset).not.toHaveProperty("sealedCharges");
  });

  it.each(["yes", 1, 0, null, {}])("refuses %j", (sealedCharges) => {
    const e = refusal({ sealedCharges });
    expect(e?.status).toBe(400);
    expect(e?.message).toContain("sealedCharges");
  });

  it("accepts the Charge commands from clients", () => {
    const envelope = { commandId: "c1", matchId: "m", playerId: "P1" };
    expect(isWellFormedCommand({ ...envelope, type: "choose_charge", chargeId: "merchant_venturer" })).toBe(true);
    expect(isWellFormedCommand({ ...envelope, type: "recommission_charge" })).toBe(true);
  });
});

describe("Sealed Charges online", () => {
  it("shows each player their own draw and only the size of the rest", () => {
    const { matchId, users } = started();
    const full = store.match(matchId)?.state as GameState;
    expect(full.pending?.kind).toBe("charge");
    const chooser = actorOf(full) as PlayerId;
    const other = full.turnOrder.find((id) => id !== chooser) as PlayerId;

    const mine = stateOf(matchId, users[chooser] as UserRow);
    const theirs = stateOf(matchId, users[other] as UserRow);
    expect(mine.pending).toEqual(full.pending);
    expect(theirs.pending).toEqual({ kind: "charge", playerId: chooser, chargeIds: [HIDDEN_CHARGE, HIDDEN_CHARGE] });
    expect(theirs.chargeDeck).toEqual(full.chargeDeck?.map(() => HIDDEN_CHARGE));
    expect(service.pendingNotices((users[chooser] as UserRow).id)).toHaveLength(1);
    expect(service.pendingNotices((users[other] as UserRow).id)).toHaveLength(0);
  });

  it("takes each player's choice as a command and keeps it from the rival", () => {
    const { matchId, users } = started();
    for (let i = 0; i < 2; i++) {
      const full = store.match(matchId)?.state as GameState;
      const chooser = actorOf(full) as PlayerId;
      const view = stateOf(matchId, users[chooser] as UserRow);
      const chargeId = view.pending?.kind === "charge" ? (view.pending.chargeIds[1] as string) : "";
      const res = service.submit(users[chooser] as UserRow, {
        matchId,
        expectedRevision: view.revision,
        commands: [{ type: "choose_charge", chargeId, commandId: `keep-${i}`, matchId, playerId: chooser }],
      });
      expect(res.accepted, JSON.stringify(res.error)).toBe(true);
      expect(res.events).toContainEqual({ type: "charge_kept", playerId: chooser, chargeId });
    }
    const full = store.match(matchId)?.state as GameState;
    expect(full.pending).toBeUndefined();
    for (const [playerId, user] of Object.entries(users)) {
      const view = stateOf(matchId, user);
      for (const id of full.turnOrder) {
        const expected = id === playerId ? full.players[id]?.sealedCharge : { id: HIDDEN_CHARGE };
        expect(view.players[id]?.sealedCharge).toEqual(expected);
      }
    }
    // The rival's history shows that a Charge was kept, not which.
    const history = service.history(matchId, bob).entries.flatMap((e) => e.events);
    const kept = history.filter((e) => e.type === "charge_kept");
    expect(kept).toHaveLength(2);
    const bobId = service.view(matchId, bob).youAre;
    for (const e of kept) if (e.type === "charge_kept" && e.playerId !== bobId) expect(e.chargeId).toBeNull();
  });

  it("lets an AI seat keep its Charge", async () => {
    const { matchId } = create({ sealedCharges: true, aiSeats: [{ displayName: "Robo", level: "normal" }] });
    const aiId = service.view(matchId, alice).youAre === "P1" ? "P2" : "P1";
    expect(await until(() => !!(store.match(matchId)?.state as GameState).players[aiId]?.sealedCharge)).toBe(true);
  });
});
