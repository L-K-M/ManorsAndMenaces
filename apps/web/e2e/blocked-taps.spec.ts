import { expect, test, type Locator, type Page } from "@playwright/test";
import { pick } from "./pick";

// A tap the rules refuse opens a dialog saying why, rather than doing
// nothing or explaining in the footer: a card that can't be played now, a
// build tool on a spot where none may stand. Two human seats share the
// screen and nobody is dealt cards; the debug panel (§100) deals the card.

/** A 2-player hot-seat game past setup, in the first player's Main phase. */
async function start(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", privacyCurtain: false, sound: false, rivalChatter: false, bannerWarning: false }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
  await page.getByText("Advanced", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Starting cards and regular draws" }).uncheck();
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  for (let step = 0; step < 20 && !(await page.getByRole("button", { name: /Assign Banners →/ }).count()); step++) {
    const status = await page.locator(".actions .status").evaluateAll((els) => els[0]?.textContent ?? "");
    if (/place a Manor/.test(status)) await pick(page.locator(".site.hl").first());
    else if (/free Route/.test(status)) await pick(page.locator(".route.hl").first());
    else if (/starting Banners/.test(status)) await page.getByRole("button", { name: /Confirm Banners/ }).click();
  }
  await expect(page.getByRole("button", { name: /Assign Banners →/ })).toBeVisible();
}

/** Opens the debug panel, runs `act` in it and closes it. */
async function debug(page: Page, act: (panel: Locator) => Promise<void>) {
  await page.getByRole("button", { name: "Debug", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Debug tools" });
  await act(panel);
  await panel.getByRole("button", { name: "Close", exact: true }).click();
}

async function showHand(page: Page) {
  const toggle = page.locator(".tray-toggle");
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

const handCard = (page: Page, id: string) => page.locator(".hand button.card").filter({ has: page.locator(`[data-card-art="${id}"]`) });

test("tapping a card that can't be played says why in a dialog @mobile", async ({ page }) => {
  await start(page);
  await debug(page, async (panel) => {
    await panel.getByRole("combobox", { name: "Card", exact: true }).selectOption("counterspell");
    await panel.getByRole("button", { name: "Draw specific card" }).click();
  });
  await showHand(page);
  await handCard(page, "counterspell").click();

  const dialog = page.getByRole("dialog", { name: "You can't play Counterspell now" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Counterspell is played only when another player plays a Spell.");
  // The dialog fits a phone screen.
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(handCard(page, "counterspell")).toHaveAttribute("aria-pressed", "false");
});

test("a build tool on a taken Route says why and stays armed", async ({ page }) => {
  await start(page);
  await debug(page, (panel) => panel.getByRole("button", { name: "Grant 5 of each resource" }).click());
  await page.getByRole("button", { name: /Build Route/ }).first().click();
  await pick(page.locator(".route[aria-label*='owned by']").first());

  const dialog = page.getByRole("dialog", { name: "You can't build a Route here" });
  await expect(dialog).toContainText("That Route is already owned.");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  // Closing the dialog leaves the tool armed for the next pick.
  await expect(page.locator(".route.hl").first()).toBeVisible();
});
