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

  it("cover every card in the current deck", () => {
    for (const card of CARDS) expect(hasCardPainting(card.effectId), card.id).toBe(true);
  });
});
