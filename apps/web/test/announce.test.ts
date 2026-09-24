import { GREENVALE_MAP } from "@manors-menaces/content";
import { describe, expect, it } from "vitest";
import { announcementsFor, type Perspective } from "../src/lib/game/announce.js";
import type { LogEntry } from "../src/lib/game/log.js";

const names = { alice: "Alice", bertram: "Bertram", cordelia: "Cordelia" };
const soloAlice: Perspective = { self: "alice", isOwn: (pid) => pid === "alice" };
const hotseat: Perspective = { self: null, isOwn: (pid) => pid === "alice" || pid === "bertram" };

const site = GREENVALE_MAP.sites.find((s) => !s.landmarkId)!;
const region = GREENVALE_MAP.regions.find((r) => r.id === site.adjacentRegionIds[0])!;

let id = 1;
const entry = (e: Omit<LogEntry, "id">): LogEntry => ({ id: id++, ...e });
const turn = (playerId: string) => entry({ text: "—", playerId, kind: "turn", raw: { type: "turn_started", playerId } as never });
const manor = (playerId: string) =>
  entry({ text: "built a Manor.", playerId, kind: "info", raw: { type: "holding_built", playerId, holdingId: "h1", siteId: site.id, free: false } });

describe("announcementsFor", () => {
  it("announces an AI's turn, its builds with their place, and important actions", () => {
    const lines = announcementsFor(
      [
        turn("cordelia"),
        entry({ text: "Cordelia harvested 1 Grain.", playerId: "cordelia", kind: "info" }),
        manor("cordelia"),
        entry({ text: "Cordelia played Royal Writ.", playerId: "cordelia", kind: "important" }),
      ],
      GREENVALE_MAP,
      names,
      soloAlice,
    );
    expect(lines).toEqual(["Cordelia's turn.", `Cordelia built a Manor at ${region.name}.`, "Cordelia played Royal Writ."]);
  });

  it("greets the single local seat with 'Your turn' but names each hot-seat human", () => {
    expect(announcementsFor([turn("alice")], GREENVALE_MAP, names, soloAlice)).toEqual(["Your turn."]);
    expect(announcementsFor([turn("alice")], GREENVALE_MAP, names, hotseat)).toEqual(["Alice's turn."]);
  });

  it("stays quiet about the local user's own actions and provisional entries", () => {
    const own = [manor("alice"), entry({ text: "Alice played X.", playerId: "alice", kind: "important" })];
    expect(announcementsFor(own, GREENVALE_MAP, names, soloAlice)).toEqual([]);
    const provisional = { ...manor("cordelia"), provisional: true };
    expect(announcementsFor([provisional], GREENVALE_MAP, names, soloAlice)).toEqual([]);
  });

  it("always announces the winner", () => {
    const won = entry({ text: "Alice wins with 12 Renown!", playerId: "alice", kind: "important", raw: { type: "game_won", playerId: "alice", renown: 12 } as never });
    expect(announcementsFor([won], GREENVALE_MAP, names, soloAlice)).toEqual(["Alice wins with 12 Renown!"]);
  });
});
