import { expect, test, type Page } from "@playwright/test";
import { pick } from "./pick";

async function start(page: Page, income = true) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", privacyCurtain: false, sound: false }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
  if (!income) {
    await page.getByText("Advanced", { exact: true }).click();
    await page.getByRole("checkbox", { name: "Starting cards and regular draws" }).uncheck();
  }
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  for (let step = 0; step < 20 && !(await page.getByRole("button", { name: /Assign Banners →/ }).count()); step++) {
    const status = await page.locator(".actions .status").evaluateAll((els) => els[0]?.textContent ?? "");
    if (/place a Manor/.test(status)) await pick(page.locator(".site.hl").first());
    else if (/free Route/.test(status)) await pick(page.locator(".route.hl").first());
    else if (/starting Banners/.test(status)) await page.getByRole("button", { name: /Confirm Banners/ }).click();
  }
  await expect(page.getByRole("button", { name: /Assign Banners →/ })).toBeVisible();
}
async function showHand(page: Page) {
  const toggle = page.locator(".tray-toggle");
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
}
async function endTurn(page: Page) {
  await page.getByRole("button", { name: /Assign Banners →/ }).click();
  await page.getByRole("button", { name: /End Turn/ }).click();
}

test("starting hands and round-three draws persist through reload without duplicates @mobile", async ({ page }) => {
  await start(page);
  await showHand(page);
  await expect(page.locator(".hand button.card")).toHaveCount(2);
  await expect(page.locator(".draw-note")).toHaveText("Next free card: round 3");
  for (let turn = 0; turn < 4; turn++) await endTurn(page);
  await showHand(page);
  await expect(page.locator(".hand button.card")).toHaveCount(3);
  await expect(page.locator(".draw-note")).toHaveText("Next free card: round 6");
  const cards = await page.locator(".hand button.card").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved." })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await expect(page.getByRole("button", { name: /Assign Banners →/ })).toBeVisible();
  await showHand(page);
  await expect(page.locator(".hand button.card")).toHaveCount(3);
  expect(await page.locator(".hand button.card").evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")))).toEqual(cards);
  await expect(page.locator(".draw-note")).toHaveText("Next free card: round 6");
});

test("the comparison option disables both starting and recurring card income", async ({ page }) => {
  await start(page, false);
  for (let turn = 0; turn < 4; turn++) await endTurn(page);
  await showHand(page);
  await expect(page.locator(".hand button.card")).toHaveCount(0);
  await expect(page.locator(".draw-note")).toHaveCount(0);
});
