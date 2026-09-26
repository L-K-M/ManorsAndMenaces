import { expect, test, type Page } from "@playwright/test";
import { CARDS } from "@manors-menaces/content";
import { BALANCE } from "@manors-menaces/rules";

async function dealPaintedCards(page: Page, ids = CARDS.map((c) => c.id), highContrast = false, textScale = 1) {
  await page.goto("/");
  await page.evaluate(({ highContrast, textScale }) => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: false, highContrast, textScale }));
    indexedDB.deleteDatabase("manors-menaces");
  }, { highContrast, textScale });
  await page.reload();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("radio", { name: "3", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
  await page.getByLabel("Player 3 type").selectOption("human");
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  await page.getByRole("button", { name: "Debug", exact: true }).click();
  const debug = page.getByRole("dialog", { name: "Debug tools" });
  for (const id of ids) {
    await debug.getByRole("combobox", { name: "Card", exact: true }).selectOption(id);
    await debug.getByRole("button", { name: "Draw specific card" }).click();
  }
  await debug.getByRole("button", { name: "Close", exact: true }).click();
  const tray = page.locator(".tray-toggle");
  if (await tray.isVisible() && await tray.getAttribute("aria-expanded") === "false") await tray.click();
  await expect(page.locator(".hand button.card")).toHaveCount(ids.length);
}

test("every distinct card has its own painting and a larger readable preview", async ({ page }) => {
  await dealPaintedCards(page);
  // Enter keyboard modality: script-only focus does not match :focus-visible
  // after the mouse clicks used to deal the review hand.
  await page.keyboard.press("Tab");
  const sources = new Set<string>();
  for (const def of CARDS) {
    const card = page.locator(".hand button.card").filter({ has: page.locator(`[data-card-art="${def.id}"]`) });
    await card.scrollIntoViewIfNeeded();
    const art = card.locator(".card-art img");
    await expect.poll(() => art.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(600);
    sources.add((await art.getAttribute("src"))!);
    await expect(card).toHaveAttribute("aria-label", /.+ \(.+\): .+/);
    await card.focus();
    const peek = page.locator(".hand .peek");
    await expect(peek).toBeVisible();
    await expect(peek.locator(".card-art")).toHaveAttribute("data-card-art", def.id);
    expect((await peek.locator(".illustration").boundingBox())!.width).toBeGreaterThan((await card.locator(".illustration").boundingBox())!.width * 1.4);
    expect(await peek.locator(".rules").evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    const box = (await peek.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  expect(sources.size).toBe(CARDS.length);
});

test("card art keeps vector alternatives for high contrast and failed loads", async ({ page }) => {
  await page.route("**/art/cards/wizard_interference.webp", (route) => route.abort());
  await dealPaintedCards(page, ["wizard_interference"]);
  const card = page.locator(".hand button.card");
  await expect(card.locator(".card-art svg")).toBeVisible();
  await expect(card.locator(".card-art img")).toHaveCount(0);
  await expect(card.locator(".rules")).toContainText("Banner");

  await page.unroute("**/art/cards/wizard_interference.webp");
  await dealPaintedCards(page, ["knight_errant"], true);
  await expect(card.locator(".card-art svg")).toBeVisible();
  await expect(card.locator(".card-art img")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await card.focus();
  await expect(page.locator(".peek .card-art svg")).toBeVisible();
});

test("illustrated previews stay inside short and portrait viewports", async ({ page }) => {
  await dealPaintedCards(page, ["ragnarok"]);
  for (const size of [{ width: 844, height: 390 }, { width: 360, height: 640 }, { width: 1180, height: 820 }]) {
    await page.setViewportSize(size);
    await expect(page.locator(".game")).toHaveAttribute("data-layout", size.width === 360 ? "sheet" : size.width === 844 ? "rail" : "wide");
    const tray = page.locator(".tray-toggle");
    if (await tray.isVisible() && await tray.getAttribute("aria-expanded") === "false") await tray.click();
    const card = page.locator(".hand button.card");
    await card.scrollIntoViewIfNeeded();
    await card.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const peek = page.locator(".hand .peek");
    await expect(peek).toBeVisible();
    const box = (await peek.boundingBox())!;
    expect(box.y, `${size.width}x${size.height} top`).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `${size.width}x${size.height} bottom`).toBeLessThanOrEqual(size.height);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(await peek.locator(".rules").evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  }
});

test("empty hands show painted art and readable resource costs at large text @mobile", async ({ page }) => {
  await dealPaintedCards(page, [], false, 1.5);
  for (const size of [{ width: 1400, height: 900 }, { width: 360, height: 640 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await expect(page.locator(".game")).toHaveAttribute("data-layout", size.width === 360 ? "sheet" : size.width === 844 ? "rail" : "wide");
    const tray = page.locator(".tray-toggle");
    if (await tray.isVisible() && await tray.getAttribute("aria-expanded") === "false") await tray.click();
    const empty = page.locator(".empty-hand");
    await expect(empty).toContainText("No cards in hand");
    await empty.locator(".empty-title").scrollIntoViewIfNeeded();
    await expect(empty.locator(".empty-title")).toBeInViewport({ ratio: 1 });
    await expect.poll(() => empty.locator("img").evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(256);
    const costs = empty.locator(".card-cost > span");
    await expect(costs).toHaveCount(Object.keys(BALANCE.costs.card).length);
    for (const [resource, count] of Object.entries(BALANCE.costs.card)) {
      const badge = costs.filter({ has: page.locator(`[data-resource="${resource}"]`) });
      await expect(badge).toContainText(String(count));
      await badge.scrollIntoViewIfNeeded();
      await expect(badge).toBeInViewport({ ratio: 1 });
    }
    expect(await empty.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
});

test("empty-hand art keeps a vector fallback", async ({ page }) => {
  await page.route("**/art/ui/empty-hand.png", (route) => route.abort());
  await dealPaintedCards(page, []);
  await expect(page.locator(".empty-art svg")).toBeVisible();
  await expect(page.locator(".empty-art img")).toHaveCount(0);
  await page.unroute("**/art/ui/empty-hand.png");
  await dealPaintedCards(page, [], true);
  await expect(page.locator(".empty-art svg")).toBeVisible();
  await expect(page.locator(".empty-art img")).toHaveCount(0);
});

test("hands use portrait cards with prominent artwork on desktop and phone @mobile", async ({ page }) => {
  await dealPaintedCards(page, ["festival_at_the_inn", "knight_errant", "wizard_interference"]);
  for (const size of [{ width: 1400, height: 900 }, { width: 1280, height: 720 }, { width: 412, height: 915 }]) {
    await page.setViewportSize(size);
    await expect(page.locator(".game")).toHaveAttribute("data-layout", size.width === 412 ? "sheet" : "wide");
    const tray = page.locator(".tray-toggle");
    if (await tray.isVisible() && await tray.getAttribute("aria-expanded") === "false") await tray.click();
    for (const card of await page.locator(".hand button.card").all()) {
      await card.scrollIntoViewIfNeeded();
      const box = (await card.boundingBox())!;
      const art = (await card.locator(".illustration").boundingBox())!;
      expect(box.height / box.width).toBeGreaterThan(1.35);
      expect(art.width).toBeGreaterThan(box.width * 0.8);
      expect(art.height).toBeGreaterThan(30);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
