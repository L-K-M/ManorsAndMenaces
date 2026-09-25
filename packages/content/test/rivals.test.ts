import { describe, expect, it } from "vitest";
import { EN, RIVALS, RIVAL_QUIP_TRIGGERS, rivalById, rivalQuipKeys } from "../src/index.js";

describe("rival roster", () => {
  it("has unique ids and names", () => {
    expect(RIVALS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(RIVALS.map((r) => r.id)).size).toBe(RIVALS.length);
    expect(new Set(RIVALS.map((r) => EN[r.nameKey])).size).toBe(RIVALS.length);
  });

  it("names, titles and mottos are in the catalog", () => {
    for (const r of RIVALS) {
      for (const key of [r.nameKey, r.titleKey, r.mottoKey]) expect(EN[key], key).toBeTruthy();
    }
  });

  it("has 3 to 8 quips for every trigger, numbered without gaps", () => {
    for (const r of RIVALS) {
      let counted = 0;
      for (const trigger of RIVAL_QUIP_TRIGGERS) {
        const keys = rivalQuipKeys(r.id, trigger);
        expect(keys.length, `${r.id} ${trigger}`).toBeGreaterThanOrEqual(3);
        expect(keys.length, `${r.id} ${trigger}`).toBeLessThanOrEqual(8);
        for (const k of keys) expect(EN[k]?.trim(), k).toBeTruthy();
        counted += keys.length;
      }
      // A gap in the numbering (or an unknown trigger) would hide lines.
      const all = Object.keys(EN).filter((k) => k.startsWith(`rival.${r.id}.quip.`));
      expect(all.length, r.id).toBe(counted);
    }
  });

  it("looks rivals up by id", () => {
    expect(rivalById("grum")?.nameKey).toBe("rival.grum.name");
    expect(rivalById("nobody")).toBeUndefined();
    expect(rivalById(undefined)).toBeUndefined();
  });
});
