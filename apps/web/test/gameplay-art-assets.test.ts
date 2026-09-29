import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { CHARGES, MAPS, MENACES, QUESTS } from "@manors-menaces/content";

import { chargePainting } from "../src/lib/chargePaintings.js";

const ART = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "art");

it("has a painting for every Royal Quest", () => {
  expect(QUESTS.length).toBeGreaterThan(0);
  for (const quest of QUESTS) {
    expect(existsSync(join(ART, "quests", `${quest.conditionId}.webp`)), quest.id).toBe(true);
  }
});

it("has a miniature for every Menace", () => {
  expect(MENACES.length).toBeGreaterThan(0);
  for (const menace of MENACES) {
    expect(existsSync(join(ART, "menaces", `${menace.type.replaceAll("_", "-")}.png`)), menace.type).toBe(true);
  }
});

it("has a painting for every landmark used on a published island", () => {
  const ids = new Set(Object.values(MAPS).flatMap((map) => map.landmarks.map((landmark) => landmark.id)));
  expect(ids.size).toBeGreaterThan(0);
  for (const id of ids) expect(existsSync(join(ART, "landmarks", `${id}.png`)), id).toBe(true);
});


it("illustrates every Sealed Charge with an existing goal-specific asset", () => {
  expect(CHARGES.length).toBeGreaterThan(0);
  for (const charge of CHARGES) {
    const painting = chargePainting(charge.id);
    expect(painting, charge.id).not.toBeNull();
    expect(existsSync(join(ART, painting!)), charge.id).toBe(true);
  }
  expect(chargePainting("__hidden__")).toBeNull();
  expect(chargePainting("unknown")).toBeNull();
});
