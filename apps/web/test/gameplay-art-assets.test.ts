import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { MAPS, MENACES, QUESTS } from "@manors-menaces/content";

const ART = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "art");

it("has a painting for every Royal Quest", () => {
  for (const quest of QUESTS) {
    expect(existsSync(join(ART, "quests", `${quest.conditionId}.webp`)), quest.id).toBe(true);
  }
});

it("has a miniature for every Menace", () => {
  for (const menace of MENACES) {
    expect(existsSync(join(ART, "menaces", `${menace.type.replaceAll("_", "-")}.png`)), menace.type).toBe(true);
  }
});

it("has a painting for every landmark used on a published island", () => {
  const ids = new Set(Object.values(MAPS).flatMap((map) => map.landmarks.map((landmark) => landmark.id)));
  for (const id of ids) expect(existsSync(join(ART, "landmarks", `${id}.png`)), id).toBe(true);
});
