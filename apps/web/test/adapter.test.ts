import { beforeEach, describe, expect, it } from "vitest";
import { SAVE_SCHEMA_VERSION, type SaveFile } from "@manors-menaces/protocol";
import { RULESET_VERSION, mvpRuleset } from "@manors-menaces/rules";
import { engineFor } from "../src/lib/game/engine.js";
import { BrowserPlatformAdapter } from "../src/lib/platform/adapter.js";
import { FakeIndexedDB } from "./fake-indexeddb.js";

function saveFile(savedAt = "2026-01-01T00:00:00.000Z"): SaveFile {
  const state = engineFor().createGame({
    matchId: "m1",
    seed: "s",
    rulesetVersion: RULESET_VERSION,
    ruleset: mvpRuleset(),
    players: [
      { id: "P1", displayName: "Alice" },
      { id: "P2", displayName: "Bertram" },
    ],
  });
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    rulesetVersion: RULESET_VERSION,
    savedAt,
    mapId: "greenvale",
    seats: [
      { playerId: "P1", displayName: "Alice", kind: "human", color: 0 },
      { playerId: "P2", displayName: "Bertram", kind: "ai", aiLevel: "easy", color: 1 },
    ],
    initialState: state,
    state,
    commandHistory: [],
  };
}

describe("BrowserPlatformAdapter (IndexedDB)", () => {
  let idb: FakeIndexedDB;
  let adapter: BrowserPlatformAdapter;

  beforeEach(() => {
    idb = new FakeIndexedDB();
    (globalThis as { indexedDB?: unknown }).indexedDB = idb;
    adapter = new BrowserPlatformAdapter();
  });

  it("reuses one connection for every operation", async () => {
    for (let i = 0; i < 10; i++) await adapter.save(`s${i}`, "label", saveFile());
    await adapter.listSaves();
    await adapter.load("s3");
    await adapter.remove("s3");
    expect(idb.opens).toBe(1);
  });

  it("rejects a save whose transaction aborts, and stores nothing", async () => {
    idb.failCommits = true;
    await expect(adapter.save("lost", "label", saveFile())).rejects.toThrow();
    idb.failCommits = false;
    expect(await adapter.load("lost")).toBeNull();
  });

  it("resolves a save only once its data is durable", async () => {
    await adapter.save("a", "label", saveFile());
    // A second adapter shares the store but not the connection.
    expect(await new BrowserPlatformAdapter().load("a")).not.toBeNull();
  });

  it("closes its connection when another tab upgrades, then reopens", async () => {
    await adapter.save("a", "label", saveFile());
    idb.requestUpgrade();
    expect(idb.connections[0]?.closed).toBe(true);
    await adapter.save("b", "label", saveFile());
    expect(idb.opens).toBe(2);
    expect((await adapter.listSaves()).map((s) => s.id).sort()).toEqual(["a", "b"]);
  });

  it("lists saves newest first with their stored data", async () => {
    await adapter.save("old", "label", saveFile("2026-01-01T00:00:00.000Z"));
    await adapter.save("new", "label", saveFile("2026-02-01T00:00:00.000Z"));
    const saves = await adapter.listSaves();
    expect(saves.map((s) => s.id)).toEqual(["new", "old"]);
    expect(saves[0]?.data).toEqual(saveFile("2026-02-01T00:00:00.000Z"));
  });
});
