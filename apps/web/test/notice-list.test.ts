import { describe, expect, it } from "vitest";
import type { MatchNotice } from "@manors-menaces/protocol";
import { MAX_NOTICES, withNotice } from "../src/lib/online/noticeList.js";

// Notices about matches that are not on screen (spec §85) wait in a short
// list until opened or dismissed.
const notice = (matchId: string, kind: MatchNotice["kind"] = "your_turn"): MatchNotice => ({ matchId, kind, title: "Your turn", body: `Match ${matchId}` });

describe("withNotice", () => {
  it("puts the newest notice first", () => {
    expect(withNotice([notice("a")], notice("b"), null).map((n) => n.matchId)).toEqual(["b", "a"]);
  });

  it("keeps one notice per match, the latest", () => {
    const list = withNotice([notice("a"), notice("b")], notice("b", "match_over"), null);
    expect(list.map((n) => [n.matchId, n.kind])).toEqual([
      ["b", "match_over"],
      ["a", "your_turn"],
    ]);
  });

  it("ignores the match on screen, which shows its own turn", () => {
    expect(withNotice([notice("a")], notice("b"), "b")).toEqual([notice("a")]);
  });

  it("keeps only the newest few", () => {
    let list: MatchNotice[] = [];
    for (let i = 0; i < MAX_NOTICES + 3; i++) list = withNotice(list, notice(`m${i}`), null);
    expect(list).toHaveLength(MAX_NOTICES);
    expect(list[0]?.matchId).toBe(`m${MAX_NOTICES + 2}`);
  });
});
