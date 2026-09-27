import { expect, test, type Page } from "@playwright/test";
import { pick } from "./pick";

// Turn flow: phase buttons that survive repeated clicks, the Market staying
// open between trades, the Banner phase fast path, the idle Banner warning
// and action explanations.

/** The Banner warning is off unless a test turns it on. */
async function startHotseat(page: Page, seed = "e2e-seed", bannerWarning = false) {
  await page.goto("/");
  await page.evaluate((bannerWarning) => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true, bannerWarning }));
    indexedDB.deleteDatabase("manors-menaces");
  }, bannerWarning);
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill(seed);
  await page.getByRole("button", { name: "Begin" }).click();
}

async function passCurtain(page: Page) {
  await page
    .getByRole("button", { name: "Tap to begin turn" })
    .click({ timeout: 1500 })
    .catch(() => undefined);
}

const statusLine = (page: Page) => page.locator(".actions .status").first();

/**
 * Place both Manors of each player: the first player takes the first and last
 * legal Sites, or its first Manor on the first legal Site named `firstSite`.
 */
async function completeSetup(page: Page, firstSite?: RegExp) {
  let manors = 0;
  for (let k = 0; k < 12; k++) {
    await passCurtain(page);
    const s = (await statusLine(page).count()) ? ((await statusLine(page).textContent()) ?? "") : "";
    if (/place a Manor/.test(s)) {
      const sites = page.locator(".site.hl");
      if (manors === 0 && firstSite) await sites.and(page.getByRole("button", { name: firstSite })).first().click();
      else await (manors === 3 ? sites.last() : sites.first()).click();
      manors++;
    } else if (/free Route/.test(s)) await pick(page.locator(".route.hl").first());
    else if (/starting Banners/.test(s)) {
      const n = await page.locator(".banner.hl").count();
      for (let i = 0; i < n; i++) {
        await page.locator(".banner.hl").nth(i).click();
        const regions = page.locator(".region.hl");
        if (await regions.count()) await pick(regions.first());
      }
      await page.getByRole("button", { name: /Confirm Banners/ }).click();
    } else break;
  }
  await passCurtain(page);
  await expect(page.getByRole("button", { name: /Assign Banners/ })).toBeVisible();
}

async function debugGrant(page: Page) {
  await page.getByRole("button", { name: "Debug" }).click();
  await page.getByRole("button", { name: "Grant 5 of each resource" }).click();
  await page.getByRole("dialog", { name: "Debug tools" }).getByRole("button", { name: "Close" }).click();
}

test("double and triple clicks never skip a phase or end the turn @mobile", async ({ page }) => {
  await startHotseat(page);
  await completeSetup(page);

  await page.getByRole("button", { name: /Assign Banners/ }).dblclick();
  await expect(statusLine(page)).toContainText("Banner Assignment");

  await page.keyboard.press("ControlOrMeta+z");
  await page.getByRole("button", { name: /Assign Banners/ }).click({ clickCount: 3 });
  await expect(statusLine(page)).toContainText("Banner Assignment");
  await expect(page.getByRole("button", { name: "Tap to begin turn" })).toHaveCount(0);
});

test("the Market stays open until both trades are used", async ({ page }) => {
  await startHotseat(page);
  await completeSetup(page);
  await debugGrant(page);

  await page.getByRole("button", { name: /^Market/ }).click();
  const market = page.getByRole("dialog", { name: "Market" });
  await market.getByRole("button", { name: /Grain/ }).first().click();
  await market.getByRole("button", { name: /Stone/ }).last().click();
  await expect(market).toBeVisible();
  await expect(market).toContainText("1 left");

  await market
    .getByRole("button", { name: /Timber/ })
    .first()
    .click();
  await market.getByRole("button", { name: /Iron/ }).last().click();
  await expect(market).toBeHidden();
  await expect(page.getByRole("button", { name: /^Market/ })).toContainText("No trades left this turn");
});

test("Back to actions leaves Banner Assignment with nothing lost @mobile", async ({ page }) => {
  await startHotseat(page);
  await completeSetup(page);
  const resources = page.locator(".player.active > .res");
  const before = await resources.textContent();

  await page.getByRole("button", { name: /Assign Banners/ }).click();
  await page.getByRole("button", { name: /Back to actions/ }).click();
  await expect(page.getByRole("button", { name: /^Build Route/ })).toBeVisible();
  await expect(resources).toHaveText(before ?? "");
});

test("pressing Enter twice from Assign Banners never ends the turn", async ({ page }) => {
  await startHotseat(page);
  await completeSetup(page);

  await page.getByRole("button", { name: /Assign Banners/ }).focus();
  await page.keyboard.press("Enter");
  await expect(statusLine(page)).toContainText("Banner Assignment");
  // Once armed, focus sits on the button that replaced Assign Banners, so a
  // repeated Enter activates it instead of reaching the End Turn shortcut.
  await expect(page.getByRole("button", { name: /Back to actions/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Assign Banners/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tap to begin turn" })).toHaveCount(0);
});

test("turn status names the player and the current phase", async ({ page }) => {
  await startHotseat(page);
  await completeSetup(page);
  const status = page.getByTestId("turn-status");
  await expect(status).toContainText("Your turn");
  await expect(status.locator("[aria-current=step]")).toHaveText("Main");

  await page.getByRole("button", { name: /Assign Banners/ }).click();
  await expect(status.locator("[aria-current=step]")).toHaveText("Banners");
});

test("End Turn in Banner Assignment ends the turn; Enter only when nothing is focused", async ({ page }) => {
  await startHotseat(page);
  await completeSetup(page);

  // Unchanged Banners: one click ends the turn.
  await page.getByRole("button", { name: /Assign Banners/ }).click();
  await page.getByRole("button", { name: /End Turn/ }).click();
  await expect(page.getByRole("button", { name: "Tap to begin turn" })).toBeVisible();
  await passCurtain(page);

  // Enter on a focused Region is a board pick, not End Turn.
  await page.getByRole("button", { name: /Assign Banners/ }).click();
  await expect(statusLine(page)).toContainText("Banner Assignment");
  await page.locator(".region").first().focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(statusLine(page)).toContainText("Banner Assignment");

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // Phase buttons (and their shortcut) arm a moment after each phase change.
  await expect(page.getByRole("button", { name: /End Turn/ })).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Tap to begin turn" })).toBeVisible();
});

test("disabled actions say why, and Trade to afford sets up the Market", async ({ page }) => {
  await startHotseat(page);
  await completeSetup(page);
  await debugGrant(page);

  // Buy cards until one of their inputs runs out.
  const buy = page.getByRole("button", { name: /^Buy Card/ });
  for (let i = 0; i < 12 && (await buy.isEnabled()); i++) await buy.click();
  await expect(buy).toBeDisabled();
  await expect(buy).toContainText(/Need \d/);

  const warden = page.locator(".tool", { has: page.getByRole("button", { name: /^Hire a Warden/ }) });
  await expect(warden.getByRole("button", { name: /^Hire a Warden/ })).toBeDisabled();
  await warden.getByRole("button", { name: "Trade at the Market to afford Hire a Warden" }).click();

  const market = page.getByRole("dialog", { name: "Market" });
  await expect(market).toContainText("To afford Hire a Warden");
  // One or two suggested trades; the Market closes once the Warden is affordable.
  for (let i = 0; i < 2 && (await market.isVisible()); i++) await market.locator("button.suggested").click();
  await expect(market).toBeHidden();
  // The Warden is affordable and armed: Menaces are highlighted for picking.
  await expect(page.locator(".menace.hl").first()).toBeVisible();
});

test("only the suggested Market route marks a resource as suggested", async ({ page }) => {
  await startHotseat(page);
  // A Timber or Stone Trading Post, so card purchases never spend its resource.
  await completeSetup(page, /Trading Post \((Timber|Stone) 2:1\)/);
  await debugGrant(page);

  const buy = page.getByRole("button", { name: /^Buy Card/ });
  for (let i = 0; i < 12 && (await buy.isEnabled()); i++) await buy.click();
  await expect(buy).toBeDisabled();
  await page.getByRole("button", { name: "Trade at the Market to afford Buy Card" }).click();

  const market = page.getByRole("dialog", { name: "Market" });
  const viaPost = market.getByRole("button", { name: /Trading Post/ });
  // The Trading Post is the cheaper route, so the suggestion preselects it.
  await expect(viaPost).toHaveClass(/\bon\b/);
  await expect(market.locator("button.suggested")).toHaveCount(1);

  const postResource = /(Timber|Stone)/.exec((await viaPost.textContent()) ?? "")?.[1] ?? "";
  expect(postResource).not.toBe("");
  await market.getByRole("button", { name: new RegExp(`^3× .*${postResource}`) }).click();
  await expect(market.locator("button.suggested")).toHaveCount(0);
});

test("a claimable Quest is badged, prompted, and recalled when leaving Main", async ({ page }) => {
  // A seed that reveals Far Reaches (the deck's size decides the shuffle:
  // #22's 2-player deck and the third wave of cards each moved it).
  await startHotseat(page, "e2e-seed-10");
  // The first player's Manors sit far apart, so Far Reaches is complete.
  await completeSetup(page);

  await expect(page.getByRole("tab", { name: /Quests/ })).toContainText("1");
  const claim = page.getByRole("button", { name: /Claim Far Reaches/ });
  await expect(claim).toBeVisible();

  await page.getByRole("button", { name: /Assign Banners/ }).click();
  const reminder = page.getByRole("status").filter({ hasText: "Far Reaches is still yours to claim" });
  await expect(reminder).toBeVisible();
  await reminder.getByRole("button", { name: "Dismiss" }).click();
  await expect(reminder).toBeHidden();

  await page.getByRole("button", { name: /Back to actions/ }).click();
  await page.getByRole("button", { name: /Assign Banners/ }).click();
  await reminder.getByRole("button", { name: "Back and claim" }).click();
  await expect(claim).toBeHidden();
  await expect(page.getByRole("button", { name: /Assign Banners/ })).toBeVisible();
  await page.getByRole("tab", { name: /Quests/ }).click();
  await expect(page.getByText(/Far Reaches — /)).toBeVisible();
});

// §16.3: ending a turn while the Banners could harvest more asks first.
const warningDialog = (page: Page) => page.getByRole("dialog", { name: "Your Banners could harvest more" });

/** In Banner Assignment: sends every Banner of the active player home, freeing the Regions they held. */
async function sendBannersHome(page: Page) {
  const banners = page.locator(".banner.hl");
  const n = await banners.count();
  for (let i = 0; i < n; i++) {
    await banners.nth(i).click();
    await page.getByRole("button", { name: /Send home/ }).click();
  }
  await expect(page.locator(".banner.hl.home")).toHaveCount(n);
}

/** Into Banner Assignment with every Banner at home, then End Turn. */
async function endTurnWithBannersHome(page: Page) {
  await page.getByRole("button", { name: /Assign Banners/ }).click();
  await sendBannersHome(page);
  await page.getByRole("button", { name: /Confirm & End Turn/ }).click();
}

test("idle Banners warn before the turn ends; Place Banners keeps the phase", async ({ page }) => {
  await startHotseat(page, "e2e-seed", true);
  await completeSetup(page);
  await endTurnWithBannersHome(page);

  const warning = warningDialog(page);
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Next Harvest: +0 now");
  const place = warning.getByRole("button", { name: "Place Banners" });
  await expect(place).toBeFocused();
  await place.click();

  await expect(warning).toBeHidden();
  await expect(statusLine(page)).toContainText("Banner Assignment");
  // The first Banner to move is picked up, with its Regions highlighted.
  await expect(page.locator(".banner.selected")).toHaveCount(1);
  await expect(page.locator(".region.hl").first()).toBeAttached();
  await expect(page.getByRole("button", { name: "Tap to begin turn" })).toHaveCount(0);
});

test("End turn anyway ends the turn with the Banners at home", async ({ page }) => {
  await startHotseat(page, "e2e-seed", true);
  await completeSetup(page);
  await endTurnWithBannersHome(page);

  await warningDialog(page).getByRole("button", { name: "End turn anyway" }).click();
  await expect(page.getByRole("button", { name: "Tap to begin turn" })).toBeVisible();
});

test("Place them for me fills in the suggestion, and the turn then ends without a warning", async ({ page }) => {
  await startHotseat(page, "e2e-seed", true);
  await completeSetup(page);
  await endTurnWithBannersHome(page);

  await warningDialog(page).getByRole("button", { name: "Place them for me" }).click();
  await expect(warningDialog(page)).toBeHidden();
  await expect(statusLine(page)).toContainText("Banner Assignment");
  // "Confirm & End Turn", or "End Turn" if the suggestion is where they started.
  await page.getByRole("button", { name: /End Turn/ }).click();
  await expect(page.getByRole("button", { name: "Tap to begin turn" })).toBeVisible();
  await expect(warningDialog(page)).toHaveCount(0);
});

test("a double click on End Turn opens the warning and leaves it open", async ({ page }) => {
  await startHotseat(page, "e2e-seed", true);
  await completeSetup(page);
  await page.getByRole("button", { name: /Assign Banners/ }).click();
  await sendBannersHome(page);

  await page.getByRole("button", { name: /Confirm & End Turn/ }).dblclick();
  await expect(warningDialog(page)).toBeVisible();
  await expect(statusLine(page)).toContainText("Banner Assignment");
  await expect(page.getByRole("button", { name: "Tap to begin turn" })).toHaveCount(0);
});

test("Enter with the warning open does not end the turn", async ({ page }) => {
  await startHotseat(page, "e2e-seed", true);
  await completeSetup(page);
  await page.getByRole("button", { name: /Assign Banners/ }).click();
  await sendBannersHome(page);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page.getByRole("button", { name: /Confirm & End Turn/ })).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(warningDialog(page)).toBeVisible();
  // Focus is on Place Banners, so a second Enter goes back to the board.
  await page.keyboard.press("Enter");
  await expect(warningDialog(page)).toBeHidden();
  await expect(statusLine(page)).toContainText("Banner Assignment");
  await expect(page.getByRole("button", { name: "Tap to begin turn" })).toHaveCount(0);
});

test("with the warning switched off in Settings, idle Banners do not stop the turn", async ({ page }) => {
  await startHotseat(page, "e2e-seed", true);
  await completeSetup(page);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await settingsDialog.getByRole("checkbox", { name: "Warn about idle Banners" }).uncheck();
  await settingsDialog.getByRole("button", { name: "Close" }).click();
  await expect(settingsDialog).toBeHidden();

  await endTurnWithBannersHome(page);
  await expect(page.getByRole("button", { name: "Tap to begin turn" })).toBeVisible();
  await expect(warningDialog(page)).toHaveCount(0);
});

test("Don't warn me again switches the warning off for later turns", async ({ page }) => {
  await startHotseat(page, "e2e-seed", true);
  await completeSetup(page);
  await endTurnWithBannersHome(page);

  const warning = warningDialog(page);
  await warning.getByRole("checkbox", { name: "Don't warn me again" }).check();
  await warning.getByRole("button", { name: "End turn anyway" }).click();
  await passCurtain(page);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.settings.v1") ?? "{}") as { bannerWarning?: boolean });
  expect(saved.bannerWarning).toBe(false);

  await endTurnWithBannersHome(page);
  await expect(page.getByRole("button", { name: "Tap to begin turn" })).toBeVisible();
  await expect(warningDialog(page)).toHaveCount(0);
});
