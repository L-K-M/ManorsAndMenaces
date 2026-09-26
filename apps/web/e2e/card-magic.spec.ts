import { expect, test, type Page } from "@playwright/test";

async function startVsAi(page: Page, speed: "normal" | "off", reducedMotion = false) {
  await page.goto("/");
  await page.evaluate(({ speed, reducedMotion }) => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: speed, reducedMotion, sound: false, privacyCurtain: false }));
    indexedDB.deleteDatabase("manors-menaces");
  }, { speed, reducedMotion });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("layout-seed-18");
  await page.getByRole("button", { name: "Begin" }).click();
}

async function status(page: Page): Promise<string> {
  // Setup can end between locator calls; read its transient status atomically.
  return page.locator(".actions .status").evaluateAll((els) => els[0]?.textContent ?? "");
}

/** Plays the human's setup; the AI plays its own. Ends in the first Main phase. */
async function completeSetup(page: Page) {
  const main = page.getByRole("button", { name: /Assign Banners →/ });
  for (let k = 0; k < 40 && !(await main.count()); k++) {
    const s = await status(page);
    if (/place a Manor/.test(s)) await page.locator(".site.hl").first().click();
    else if (/free Route/.test(s)) await page.locator(".route.hl").first().click();
    else if (/starting Banners/.test(s)) {
      const n = await page.locator(".banner.hl").count();
      for (let i = 0; i < n; i++) {
        await page.locator(".banner.hl").nth(i).click();
        const regions = page.locator(".region.hl");
        if (await regions.count()) await regions.first().click();
      }
      await page.getByRole("button", { name: /Confirm Banners/ }).click();
    } else await page.waitForTimeout(250);
  }
  await expect(main).toBeVisible();
}


async function prepareCard(page: Page, speed: "normal" | "off", reducedMotion = false) {
  await startVsAi(page, speed, reducedMotion);
  await completeSetup(page);
  await page.getByRole("button", { name: "Debug", exact: true }).click();
  const debug = page.getByRole("dialog", { name: "Debug tools" });
  await debug.getByRole("combobox", { name: "Card", exact: true }).selectOption("festival_at_the_inn");
  await debug.getByRole("button", { name: "Draw specific card" }).click();
  await debug.getByRole("button", { name: "Close", exact: true }).click();
  const tray = page.locator(".tray-toggle");
  if (await tray.isVisible() && await tray.getAttribute("aria-expanded") === "false") await tray.click();
}

test("only a committed card play casts magic, then releases the board @mobile", async ({ page }) => {
  await prepareCard(page, "normal");
  const card = page.locator(".hand button.card");
  await card.click();
  const choice = page.getByRole("dialog", { name: "Festival at the Inn", exact: true });
  await expect(choice).toBeVisible();
  await expect(page.locator(".card-magic")).toHaveCount(0);
  await choice.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".card-magic")).toHaveCount(0);
  const tray = page.locator(".tray-toggle");
  if (await tray.isVisible() && await tray.getAttribute("aria-expanded") === "false") await tray.click();
  await expect(card).toHaveCount(1);
  await card.click();
  await choice.getByRole("button", { name: "Timber", exact: true }).click();
  const magic = page.locator(".card-magic");
  await expect(magic).toBeVisible();
  await expect(magic.locator("[data-card-art]")).toHaveAttribute("data-card-art", "festival_at_the_inn");
  expect(await magic.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  await expect(card).toHaveCount(0);
  await expect(magic).toHaveCount(0, { timeout: 3000 });
});

for (const preference of ["off", "reduced"] as const) {
  test(`card plays remain functional with ${preference} motion`, async ({ page }) => {
    await prepareCard(page, preference === "off" ? "off" : "normal", preference === "reduced");
    const seen: number[] = [];
    await page.exposeFunction("recordMagic", (count: number) => seen.push(count));
    await page.evaluate(() => {
      new MutationObserver(() => {
        (window as unknown as { recordMagic: (count: number) => void }).recordMagic(document.querySelectorAll(".card-magic").length);
      }).observe(document.body, { childList: true, subtree: true });
    });
    await page.locator(".hand button.card").click();
    await page.getByRole("dialog", { name: "Festival at the Inn", exact: true }).getByRole("button", { name: "Timber", exact: true }).click();
    await expect(page.locator(".hand button.card")).toHaveCount(0);
    await page.getByRole("tab", { name: "Chronicle", exact: true }).click();
    await expect(page.locator(".tabpanel")).toContainText("Festival at the Inn");
    expect(Math.max(0, ...seen)).toBe(0);
  });
}
