import { expect, test, type Page } from "@playwright/test";
import { pick } from "./pick";
import { untilVisible } from "./plays";

// A rival's Changeling swaps your whole hand. A player once found two
// different cards in hand without noticing the toast; the hand now says which
// cards went and which came.

async function startVsAi(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: false }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByText("Advanced").click();
  // The hands in this scenario are exactly the cards drawn below.
  await page.getByRole("checkbox", { name: "Starting cards and regular draws" }).uncheck();
  await page.getByLabel(/Seed/).fill("hand-swap-seed");
  await page.getByRole("button", { name: "Begin" }).click();
}

/** Plays the human's setup; the computer plays its own. Ends in the first Main phase. */
async function completeSetup(page: Page) {
  const main = page.getByRole("button", { name: /Assign Banners →/ });
  for (let k = 0; k < 40 && !(await main.count()); k++) {
    const s = await page.locator(".actions .status").evaluateAll((els) => els[0]?.textContent ?? "");
    if (/place a Manor/.test(s)) await pick(page.locator(".site.hl").first());
    else if (/free Route/.test(s)) await pick(page.locator(".route.hl").first());
    else if (/starting Banners/.test(s)) await page.getByRole("button", { name: /Confirm Banners/ }).click();
    else await page.waitForTimeout(250);
  }
  await expect(main).toBeVisible();
}

async function draw(page: Page, player: number, cards: string[]) {
  const debug = page.getByRole("dialog", { name: "Debug tools" });
  await debug.getByRole("combobox", { name: "Player" }).selectOption({ index: player });
  for (const card of cards) {
    await debug.getByRole("combobox", { name: "Card", exact: true }).selectOption(card);
    await debug.getByRole("button", { name: "Draw specific card" }).click();
  }
}

test("says which cards a rival's Changeling took and gave @mobile", async ({ page }) => {
  await startVsAi(page);
  await completeSetup(page);
  await page.getByRole("button", { name: "Debug", exact: true }).click();
  await draw(page, 0, ["festival_at_the_inn", "arcane_exchange", "druids_blessing"]);
  // The computer holds only a Changeling, and a bigger hand to take.
  await draw(page, 1, ["changeling"]);
  await page.getByRole("dialog", { name: "Debug tools" }).getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: /Assign Banners →/ }).click();
  await page.getByRole("button", { name: /End Turn/ }).click();
  // Back to the human's turn, reading the computer's Changeling on the way
  // (the phone tray folds when a turn begins), then open the hand.
  await untilVisible(page, page.getByRole("button", { name: /Assign Banners →/ }));
  const tray = page.locator(".tray-toggle");
  if ((await tray.isVisible()) && (await tray.getAttribute("aria-expanded")) === "false") await tray.click();

  const notice = page.locator(".swap-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("swapped hands with you.");
  await expect(notice).toContainText("You gave up Festival at the Inn, Arcane Exchange and Druid's Blessing. You got no cards.");

  await notice.getByRole("button", { name: "Dismiss" }).click();
  await expect(notice).toHaveCount(0);
});
