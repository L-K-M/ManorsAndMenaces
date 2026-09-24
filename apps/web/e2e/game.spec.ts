import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

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

  // Win via debug Renown.
  await page.getByRole("button", { name: "Debug" }).click();
  const dialog = page.getByRole("dialog", { name: "Debug tools" });
  await dialog.getByLabel("Bonus Renown").fill("12");
  await dialog.getByRole("button", { name: "Set bonus Renown" }).click();
  await dialog.getByRole("button", { name: "Close" }).click();
  await endTurn(page);
  await expect(page.getByRole("dialog", { name: "Victory!" })).toBeVisible();
  // A finished game drops its autosave: Continue never reopens a Victory.
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "New game" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Continue/ })).toHaveCount(0);
  }).toPass();
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

// Save safety: a save restores exactly what was on screen, and one game's
// autosave never replaces another's.
const ownedRoutes = (page: Page) => page.locator('.route[aria-label*="owned by"]');

async function exitToTitle(page: Page) {
  await page.getByRole("button", { name: "Main menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Exit to title" }).click();
  await page.getByRole("dialog", { name: "Leave this game?" }).getByRole("button", { name: "Exit to title" }).click();
  await expect(page.getByRole("button", { name: "New game" })).toBeVisible();
}

test("the tutorial does not replace an unfinished game's Continue", async ({ page }) => {
  await startHotseat(page, "mvp");
  await completeSetup(page);
  await exitToTitle(page);

  await page.getByRole("button", { name: "Tutorial" }).click();
  await expect(page.getByRole("complementary", { name: "Tutorial" })).toBeVisible();
  await exitToTitle(page);
  await page.reload();

  await page.getByRole("button", { name: /^Continue/ }).click();
  await passCurtain(page);
  await expect(page.getByRole("region", { name: "Players" })).toContainText("Bertram");
  await expect(page.getByRole("complementary", { name: "Tutorial" })).toHaveCount(0);
});

test("Save mid-turn keeps the turn's Route after a reload", async ({ page }) => {
  await startHotseat(page);
  await completeSetup(page);
  await debugGrant(page);
  const before = await ownedRoutes(page).count();
  await page.getByRole("button", { name: /Build Route/ }).click();
  await page.locator(".route.hl").first().click();
  await expect(ownedRoutes(page)).toHaveCount(before + 1);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved." })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await passCurtain(page);
  await expect(ownedRoutes(page)).toHaveCount(before + 1);
  // The restored Route is still this turn's action, so it can be undone.
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
});

test("the game menu keeps the game open, exports a save and asks before leaving", async ({ page }) => {
  await startHotseat(page, "mvp");
  await completeSetup(page);

  // ☰ opens a menu instead of leaving; Resume returns to the same game.
  await page.getByRole("button", { name: "Main menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await menu.getByRole("button", { name: "Resume" }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Players" })).toContainText("Bertram");

  // Export save file downloads a save that imports again.
  await page.getByRole("button", { name: "Main menu" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), menu.getByRole("button", { name: "Export save file" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^manors-local-e2e-seed-r1\.json$/);
  const file = await download.path();
  const save = JSON.parse(await readFile(file, "utf8")) as { schemaVersion: number; seats: { displayName: string }[] };
  expect(save.schemaVersion).toBe(1);
  expect(save.seats.map((s) => s.displayName)).toEqual(["Alice", "Bertram"]);

  // Leaving asks first; Stay keeps the game.
  await menu.getByRole("button", { name: "Exit to title" }).click();
  const leave = page.getByRole("dialog", { name: "Leave this game?" });
  await expect(leave).toContainText("saved automatically");
  await leave.getByRole("button", { name: "Stay" }).click();
  await menu.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("region", { name: "Players" })).toBeVisible();
  await exitToTitle(page);

  // The Load list describes each save and deletes only after confirmation.
  await expect(page.getByRole("button", { name: /^Continue/ })).toContainText("Round 1");
  await page.getByRole("button", { name: "Load game" }).click();
  const load = page.getByRole("dialog", { name: "Load game" });
  const row = load.getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Alice");
  await expect(row).toContainText("Bertram");
  await expect(row).toContainText("Round 1");
  await expect(row).toContainText("Autosave");
  await row.getByRole("button", { name: "Delete save" }).click();
  await expect(row.getByRole("group", { name: "Delete this save?" })).toBeVisible();
  await row.getByRole("button", { name: "Keep" }).click();
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Delete save" }).click();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);

  await load.getByLabel("Import a save file").setInputFiles(file);
  await passCurtain(page);
  await expect(page.getByRole("region", { name: "Players" })).toContainText("Bertram");
});
