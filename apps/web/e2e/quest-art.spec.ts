import { expect, test, type Page } from "@playwright/test";
import { QUESTS, rulesContentFor } from "@manors-menaces/content";
import { SAVE_SCHEMA_VERSION, type SaveFile } from "@manors-menaces/protocol";
import { RULESET_VERSION, createRulesEngine, standardRuleset } from "@manors-menaces/rules";

// Import an isolated presentation fixture through the real save-file flow.
// Partial and complete conditions exercise the rules selector and claim action.
function questSave(ids: string[]): SaveFile {
  const engine = createRulesEngine(rulesContentFor("greenvale"));
  const seats = ["Alice", "Bertram", "Cordelia"].map((displayName, i) => ({ playerId: `P${i + 1}`, displayName, kind: "human" as const, color: i }));
  const state = engine.createGame({ matchId: "quest-art-review", seed: "quest-art", rulesetVersion: RULESET_VERSION,
    ruleset: standardRuleset(3), players: seats.map((s) => ({ id: s.playerId, displayName: s.displayName })) });
  state.status = "playing";
  state.phase = "main";
  state.round = 1;
  state.activePlayerId = "P1";
  delete state.setup;
  state.revealedQuestIds = ids;
  state.questDeck = QUESTS.map((q) => q.id).filter((id) => !ids.includes(id));
  state.revealedQuestRounds = Object.fromEntries(ids.map((id) => [id, 1]));
  state.players.P1!.stats.menacesMoved = 2;
  state.players.P1!.stats.heroesPlayed = 2;
  state.players.P1!.stats.spellsPlayed = 1;
  return { schemaVersion: SAVE_SCHEMA_VERSION, rulesetVersion: RULESET_VERSION, savedAt: new Date(0).toISOString(),
    mapId: "greenvale", seats, initialState: structuredClone(state), state, commandHistory: [] };
}

async function openQuests(page: Page, ids: string[], highContrast = false) {
  await page.goto("/");
  await page.evaluate((contrast) => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: false, highContrast: contrast })), highContrast);
  await page.reload();
  await page.getByRole("button", { name: "Load game", exact: true }).click();
  await page.getByLabel(/Import a save file/).setInputFiles({ name: "quest-art.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(questSave(ids))) });
  await page.getByRole("tab", { name: /^Quests/ }).click();
  await expect(page.locator(".quests .quest")).toHaveCount(ids.length);
}

for (let offset = 0; offset < QUESTS.length; offset += 3) {
  const quests = QUESTS.slice(offset, offset + 3);
  test(`Royal Quest paintings and readable conditions: ${quests.map((q) => q.id).join(", ")}`, async ({ page }) => {
    await openQuests(page, quests.map((q) => q.id));
    const sources = new Set<string>();
    for (const def of quests) {
      const card = page.locator(".quest").filter({ has: page.locator(`[data-quest-art="${def.conditionId}"]`) });
      await card.scrollIntoViewIfNeeded();
      const img = card.locator(".quest-art img");
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(600);
      sources.add((await img.getAttribute("src"))!);
      const name = await card.locator(".head strong").innerText();
      await expect(card.getByRole("progressbar", { name: `${name} progress`, exact: true })).toBeVisible();
      expect(await card.locator(".description").evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      await expect(card.locator(".expiry")).toContainText("4 rounds");
    }
    expect(sources.size).toBe(quests.length);
  });
}

test("quest paintings retain accessible fallbacks and full conditions", async ({ page }) => {
  await page.route("**/art/quests/monster_problems.webp", (route) => route.abort());
  await openQuests(page, ["monster_problems"]);
  await expect(page.locator(".quest-art svg")).toBeVisible();
  await expect(page.locator(".quest-art img")).toHaveCount(0);
  await expect(page.locator(".quest .description")).toHaveText("Move Menaces 3 times during the match.");
  await expect(page.locator(".quest .percent")).toHaveText("67%");
  await expect(page.getByRole("progressbar", { name: "Monster Problems progress" })).toHaveAttribute("aria-valuenow", "2");

  await openQuests(page, ["arcane_scholar"], true);
  await expect(page.locator(".quest-art svg")).toBeVisible();
  await expect(page.locator(".quest-art img")).toHaveCount(0);
  await expect(page.locator(".quest .percent")).toHaveText("33%");
});

test("illustrated quests still award Renown and record completion", async ({ page }) => {
  await openQuests(page, ["patron_of_heroes", "monster_problems", "arcane_scholar"]);
  const card = page.locator(".quest").filter({ hasText: "Patron of Heroes" });
  await expect(card.locator(".percent")).toHaveText("100%");
  await card.getByRole("button", { name: "Claim", exact: true }).click();
  await expect(page.locator(".quests .done")).toContainText("Patron of Heroes — Alice");
  await expect(page.locator('.quest-art[data-quest-art="patron_of_heroes"]')).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Scoreboard" }).getByTitle(/^Alice: 1 of 15 Renown\./)).toBeVisible();
});

test("quest rules and rewards fit phone and short landscape panels @mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openQuests(page, ["kings_highway", "friend_of_the_forest", "master_builder"]);
  for (const size of [{ width: 360, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await expect(page.locator(".game")).toHaveAttribute("data-layout", size.width === 360 ? "sheet" : "rail");
    const toggle = page.locator(".panel-toggle");
    if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
    for (const card of await page.locator(".quest").all()) {
      await card.scrollIntoViewIfNeeded();
      const box = (await card.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      expect(await card.locator(".description").evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
      await expect(card.locator(".renown")).toBeVisible();
    }
  }
});
