import { expect, test, type Page } from "@playwright/test";
import { runAiUntilHuman } from "@manors-menaces/ai";
import { rulesContentFor } from "@manors-menaces/content";
import { SAVE_SCHEMA_VERSION, type SaveFile } from "@manors-menaces/protocol";
import { RULESET_VERSION, createRng, createRulesEngine, mvpRuleset, seedRng, standardRuleset, type RulesetConfig } from "@manors-menaces/rules";
import { TUTORIAL_SEED } from "../src/lib/game/rematch.js";

// Critical flows (spec §66.5): create game, initial placement, first turn,
// build route, assign banner, harvest, buy card, move menace, save/reload, win.

async function startHotseat(page: Page, rules: "standard" | "mvp" = "standard") {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
  if (rules === "mvp") await page.getByRole("radio", { name: /Core/ }).check();
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("e2e-seed");
  await page.getByRole("button", { name: "Begin" }).click();
}

/** A finished hot-seat game with its full history, played by the AI (three players by default). */
function finishedSave(seed = "e2e-finished", names = ["Ysolde", "Wat", "Maud"], ruleset: RulesetConfig = standardRuleset(3)): SaveFile {
  const engine = createRulesEngine(rulesContentFor());
  const seats = names.map((displayName, i) => ({ playerId: `P${i + 1}`, displayName, kind: "human" as const, color: i }));
  const initialState = engine.createGame({
    matchId: `local-${seed}`,
    seed,
    rulesetVersion: RULESET_VERSION,
    ruleset,
    players: seats.map((s) => ({ id: s.playerId, displayName: s.displayName })),
  });
  const rng = createRng(seedRng(`${seed}-ai`));
  const { state, commands } = runAiUntilHuman(engine, initialState, () => true, () => ({ level: "normal", rng }), 20_000);
  expect(state.status, "the AI must finish the game within its 20,000-command budget").toBe("finished");
  return { schemaVersion: SAVE_SCHEMA_VERSION, rulesetVersion: RULESET_VERSION, savedAt: new Date(0).toISOString(), mapId: "greenvale", seats, initialState, state, commandHistory: commands };
}

async function passCurtain(page: Page) {
  const curtain = page.getByRole("button", { name: "Tap to begin turn" });
  await curtain.click({ timeout: 1500 }).catch(() => undefined);
}

async function status(page: Page): Promise<string> {
  const el = page.locator(".actions .status").first();
  return (await el.count()) ? ((await el.textContent()) ?? "") : "";
}

async function assignAllBanners(page: Page) {
  const n = await page.locator(".banner.hl").count();
  for (let i = 0; i < n; i++) {
    await page.locator(".banner.hl").nth(i).click();
    const regions = page.locator(".region.hl");
    if (await regions.count()) await regions.first().click();
  }
  await page.getByRole("button", { name: /Confirm Banners/ }).click();
}

async function completeSetup(page: Page) {
  for (let k = 0; k < 12; k++) {
    await passCurtain(page);
    const s = await status(page);
    if (/place a Manor/.test(s)) await page.locator(".site.hl").first().click();
    else if (/free Route/.test(s)) await page.locator(".route.hl").first().click();
    else if (/starting Banners/.test(s)) await assignAllBanners(page);
    else break;
  }
  await passCurtain(page);
  await expect(page.getByRole("button", { name: /Assign Banners →/ })).toBeVisible();
}

async function endTurn(page: Page) {
  await page.getByRole("button", { name: /Assign Banners →/ }).click();
  await page.getByRole("button", { name: /Confirm Banners/ }).click();
  await page.getByRole("button", { name: /End Turn/ }).click();
}

async function debugGrant(page: Page) {
  await page.getByRole("button", { name: "Debug" }).click();
  await page.getByRole("button", { name: "Grant 5 of each resource" }).click();
  await page.getByRole("dialog", { name: "Debug tools" }).getByRole("button", { name: "Close" }).click();
}

test("setup, first turn, build, harvest, warden, save and reload, victory", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await startHotseat(page);
  await completeSetup(page);

  // Build a Route with debug-granted resources.
  await debugGrant(page);
  await page.getByRole("button", { name: /Build Route/ }).click();
  const routesBefore = await page.locator(".route.hl").count();
  expect(routesBefore).toBeGreaterThan(0);
  await page.locator(".route.hl").first().click();
  await page.getByRole("tab", { name: "Chronicle" }).click();
  await expect(page.getByText(/built a Route/)).toBeVisible();

  // Undo is available for undo-safe actions.
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  // Buy a card.
  await page.getByRole("button", { name: /Buy Card/ }).click();
  await expect(page.getByText(/bought a card/)).toBeVisible();

  // Hire a Warden to move a Menace.
  await page.getByRole("button", { name: /Hire a Warden/ }).click();
  await page.locator(".menace.hl").first().click();
  await page.locator(".region.hl, .route.hl, .site.hl").first().click();
  await expect(page.getByText(/hired a Warden/)).toBeVisible();

  await endTurn(page);
  // Second player's first turn.
  await passCurtain(page);
  await endTurn(page);
  // First player's second turn: Harvest happens.
  await passCurtain(page);
  await expect(page.getByText(/harvested/).first()).toBeVisible();

  // Save, reload, continue.
  await page.getByRole("button", { name: "Save" }).click();
  const roundText = await page.locator(".round").textContent();
  await page.reload();
  await page.getByRole("button", { name: "Continue" }).click();
  await passCurtain(page);
  await expect(page.locator(".round")).toHaveText(roundText ?? "");
  // The Chronicle is rebuilt from the saved history. Debug commands are not
  // recorded, so the replay stops at the first debug-funded build and says so.
  await page.getByRole("tab", { name: "Chronicle" }).click();
  await expect(page.locator(".log li").filter({ hasText: "Alice assigned" }).first()).toBeVisible();
  await expect(page.locator(".log li").last()).toHaveText(/could not be restored/);

  // Win via debug Renown.
  await page.getByRole("button", { name: "Debug" }).click();
  const dialog = page.getByRole("dialog", { name: "Debug tools" });
  await dialog.getByLabel("Bonus Renown").fill("12");
  await dialog.getByRole("button", { name: "Set bonus Renown" }).click();
  await dialog.getByRole("button", { name: "Close" }).click();
  await endTurn(page);
  const victory = page.getByRole("dialog", { name: "Victory!" });
  await expect(victory).toBeVisible();
  await expect(victory.getByRole("heading", { name: "Final standings" })).toBeVisible();

  // The results close to show the final board and reopen from the Game over button.
  await page.keyboard.press("Escape");
  await expect(victory).toBeHidden();
  await page.getByRole("button", { name: /Game over/ }).click();
  await expect(victory).toBeVisible();

  // Play again reuses this game's seats, even after the reload above.
  await victory.getByRole("button", { name: "Play again" }).click();
  await passCurtain(page);
  await expect(page.locator(".round")).toHaveText("Round 1");
  await page.getByRole("tab", { name: "Players" }).click();
  await expect(page.locator(".players .player")).toHaveCount(2);
  await expect(page.locator(".players")).toContainText("Alice");
  await expect(page.locator(".players")).toContainText("Bertram");
  expect(errors).toEqual([]);
});

test("a finished saved game opens on the full results", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false })));
  await page.reload();
  await page.getByRole("button", { name: "Load game" }).click();
  await page.getByLabel(/Import a save file/).setInputFiles({ name: "finished.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(finishedSave())) });

  const victory = page.getByRole("dialog", { name: "Victory!" });
  await expect(victory).toBeVisible();
  await expect(victory.locator(".standings li")).toHaveCount(3);
  await expect(victory.locator("svg.renown-chart polyline")).toHaveCount(3);
  expect(await victory.locator(".award").count()).toBeGreaterThanOrEqual(2);
  expect(await victory.locator(".recap li").count()).toBeGreaterThanOrEqual(3);

  await victory.getByRole("button", { name: "View board" }).click();
  await expect(victory).toBeHidden();
  await page.getByRole("button", { name: /Game over/ }).click();
  await victory.getByRole("button", { name: "Play again" }).click();
  await passCurtain(page);
  await expect(page.locator(".round")).toHaveText("Round 1");
  await page.getByRole("tab", { name: "Players" }).click();
  for (const name of ["Ysolde", "Wat", "Maud"]) await expect(page.locator(".players")).toContainText(name);
  expect(errors).toEqual([]);
});

// Review question: does "Play again" after a tutorial continued from a save
// drop into an unguided game? It opens the New Game setup instead.
test("a finished tutorial loaded from a save leads to a real game setup", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false })));
  await page.reload();
  await page.getByRole("button", { name: "Load game" }).click();
  const save = finishedSave(TUTORIAL_SEED, ["You", "Lord Mumble"], mvpRuleset());
  await page.getByLabel(/Import a save file/).setInputFiles({ name: "tutorial.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(save)) });

  const victory = page.getByRole("dialog", { name: "Victory!" });
  await expect(victory).toBeVisible();
  await expect(victory.getByRole("button", { name: "Play again" })).toHaveCount(0);
  await victory.getByRole("button", { name: "Play a real game" }).click();
  await expect(page.getByRole("heading", { name: "New game" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("tutorial starts and coaches the first placement", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tutorial" }).click();
  await expect(page.getByRole("complementary", { name: "Tutorial" })).toBeVisible();
  await expect(page.getByText(/Place your first Manor/)).toBeVisible();
});

test("board is keyboard operable @mobile", async ({ page }) => {
  await startHotseat(page, "mvp");
  await passCurtain(page);
  const site = page.locator(".site.hl").first();
  await site.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".route.hl").first()).toBeVisible();
});
