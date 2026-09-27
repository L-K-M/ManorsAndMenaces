import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CARDS } from "@manors-menaces/content";
import { hasCardPainting } from "../src/lib/cardPaintings.js";

const PAINTINGS = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "art", "cards");

describe("card paintings", () => {
  // CardArt requests an image only for cards that have one, so a card still
  // waiting for its painting shows its emblem without a failed load.
  it("are requested exactly for the cards whose runtime painting exists", () => {
    for (const c of CARDS) expect(hasCardPainting(c.effectId), c.id).toBe(existsSync(join(PAINTINGS, `${c.effectId}.webp`)));
  });

  it("are still to be made for the third wave", () => {
    for (const id of ["disgrace", "siege_engines", "raiders", "stolen_glory", "siege_fireball", "sabotage"] as const) expect(hasCardPainting(id), id).toBe(false);
  });
});
