// The published islands new games are drawn from (spec §11). Each is generated
// from its seed by tools/generate-map.mjs into packages/content/src/maps and
// committed. Saves and online matches name an island by its id, so a published
// island's seed, id and topology stay as they are; add a new island instead.
export const ISLANDS = [
  { key: "greenvale", seed: 14, id: "greenvale-coastal-v2", name: "The Greenvale", exportName: "GREENVALE_MAP", file: "greenvale.ts" },
  { key: "ashmere", seed: 2, id: "ashmere", name: "Ashmere", exportName: "ASHMERE_MAP", file: "ashmere.ts" },
  { key: "brightwater", seed: 32, id: "brightwater", name: "Brightwater", exportName: "BRIGHTWATER_MAP", file: "brightwater.ts" },
  { key: "dunmarrow", seed: 192, id: "dunmarrow", name: "Dunmarrow", exportName: "DUNMARROW_MAP", file: "dunmarrow.ts" },
  { key: "emberreach", seed: 66, id: "emberreach", name: "The Emberreach", exportName: "EMBERREACH_MAP", file: "emberreach.ts" },
  { key: "hollowmere", seed: 212, id: "hollowmere", name: "Hollowmere", exportName: "HOLLOWMERE_MAP", file: "hollowmere.ts" },
  { key: "kingsbarrow", seed: 272, id: "kingsbarrow", name: "Kingsbarrow", exportName: "KINGSBARROW_MAP", file: "kingsbarrow.ts" },
  { key: "mistholm", seed: 65, id: "mistholm", name: "Mistholm", exportName: "MISTHOLM_MAP", file: "mistholm.ts" },
  { key: "ravensholt", seed: 197, id: "ravensholt", name: "Ravensholt", exportName: "RAVENSHOLT_MAP", file: "ravensholt.ts" },
  { key: "silverfen", seed: 206, id: "silverfen", name: "The Silverfen", exportName: "SILVERFEN_MAP", file: "silverfen.ts" },
  { key: "stagmoor", seed: 78, id: "stagmoor", name: "Stagmoor", exportName: "STAGMOOR_MAP", file: "stagmoor.ts" },
  { key: "thornwold", seed: 3, id: "thornwold", name: "The Thornwold", exportName: "THORNWOLD_MAP", file: "thornwold.ts" },
  { key: "wyrmsend", seed: 102, id: "wyrmsend", name: "Wyrmsend", exportName: "WYRMSEND_MAP", file: "wyrmsend.ts" },
];
