import { expect, test, type Page } from "@playwright/test";

// Responsive game layout (spec §53): the board stays the hero on every screen,
// never rescales while you play, and every HUD control is reachable.

async function startVsAi(page: Page, players = 2) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: false }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: String(players), exact: true }).check({ force: true });
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("layout-seed");
  await page.getByRole("button", { name: "Begin" }).click();
}

async function status(page: Page): Promise<string> {
  const el = page.locator(".actions .status").first();
  return (await el.count()) ? ((await el.textContent()) ?? "") : "";
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

/** Grants resources and draws cards through the debug panel (§100). */
async function fillHand(page: Page, count = 4) {
  await page.getByRole("button", { name: "Debug" }).click();
  const dialog = page.getByRole("dialog", { name: "Debug tools" });
  await dialog.getByRole("button", { name: "Grant 5 of each resource" }).click();
  const cards = await dialog
    .getByLabel("Card")
    .locator("option")
    .evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  for (let i = 0; i < count; i++) {
    await dialog.getByLabel("Card").selectOption(cards[i % cards.length] ?? "");
    await dialog.getByRole("button", { name: "Draw specific card" }).click();
  }
  await dialog.getByRole("button", { name: "Close" }).click();
  // The hand header and the phone tray toggle both show the count.
  await expect(page.getByText(new RegExp(`\\b${count}/7\\b`)).first()).toBeVisible();
}

/** Names of the hand's cards whose rules text is cut off. */
async function clippedRules(page: Page) {
  return page.locator(".hand .card:not(.peek)").evaluateAll((els) =>
    els
      .filter((el) => {
        const rules = el.querySelector<HTMLElement>(".rules");
        return !rules || rules.offsetHeight === 0 || rules.scrollHeight > rules.clientHeight + 1;
      })
      .map((el) => el.querySelector("strong")?.textContent ?? ""),
  );
}

async function boardBox(page: Page) {
  return page.locator(".board-wrap").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, height: r.height, width: r.width };
  });
}

/** Compares against the device size: on mobile an overflowing page widens the layout viewport. */
async function pageFits(page: Page) {
  const vp = page.viewportSize() ?? { width: 0, height: 0 };
  return page.evaluate(
    (vp) => ({
      scrollsX: Math.max(innerWidth, document.documentElement.scrollWidth) > vp.width,
      scrollsY: Math.max(innerHeight, document.documentElement.scrollHeight) > vp.height,
    }),
    vp,
  );
}

async function expectInViewport(page: Page, name: RegExp) {
  const box = await page.getByRole("button", { name }).boundingBox();
  const vp = page.viewportSize();
  expect(box && vp).toBeTruthy();
  if (!box || !vp) return;
  // One pixel of slack for subpixel layout.
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
}

test.describe("laptop 1280x720", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("board keeps its size across phases, a full hand and large text", async ({ page }) => {
    await startVsAi(page);
    await expect(page.locator(".site.hl").first()).toBeVisible();
    const setup = await boardBox(page);
    await completeSetup(page);
    const main = await boardBox(page);
    await fillHand(page);
    const cards = await boardBox(page);
    await page.getByRole("button", { name: /Assign Banners →/ }).click();
    await expect(page.getByRole("button", { name: /Confirm Banners/ })).toBeVisible();
    const banners = await boardBox(page);

    for (const b of [main, cards, banners]) expect(Math.abs(b.height - setup.height)).toBeLessThanOrEqual(1);
    expect(setup.height).toBeGreaterThanOrEqual(0.55 * 720);
    expect(await pageFits(page)).toEqual({ scrollsX: false, scrollsY: false });

    // The Text size setting scales the dock, but never starves the board.
    await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "1.5"));
    expect((await boardBox(page)).height).toBeGreaterThanOrEqual(0.4 * 720);
    expect(await pageFits(page)).toEqual({ scrollsX: false, scrollsY: false });
    await expectInViewport(page, /Confirm Banners/);
  });
});

test.describe("phone landscape", () => {
  test.use({ viewport: { width: 915, height: 412 }, isMobile: true, hasTouch: true });

  test("side rail leaves most of the height to the board", async ({ page }) => {
    await startVsAi(page);
    await completeSetup(page);
    await fillHand(page);
    for (const size of [
      { width: 915, height: 412 },
      { width: 740, height: 360 },
    ]) {
      await page.setViewportSize(size);
      expect((await boardBox(page)).height).toBeGreaterThanOrEqual(0.6 * size.height);
      expect(await pageFits(page)).toEqual({ scrollsX: false, scrollsY: false });
      await expectInViewport(page, /Assign Banners →/);
      await expect(page.getByRole("list", { name: "Scoreboard" }).getByRole("listitem")).toHaveCount(2);
    }
  });

  test("rail shows whole cards and keeps Discard in view", async ({ page }) => {
    await startVsAi(page);
    await completeSetup(page);
    await fillHand(page, 10);
    // The rail's tray scrolls, so its cards have room for all their rules.
    expect(await clippedRules(page)).toEqual([]);
    await page.getByRole("button", { name: /Assign Banners →/ }).click();
    await page.getByRole("button", { name: /Confirm Banners/ }).click();
    await expect(page.getByRole("button", { name: /^Discard \d/ })).toBeInViewport({ ratio: 1 });
  });

  test("tutorial coach sits at the bottom of the board", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Tutorial" }).click();
    const coach = await page.getByRole("complementary", { name: "Tutorial" }).boundingBox();
    const board = await boardBox(page);
    expect(coach).toBeTruthy();
    if (!coach) return;
    expect(board.top + board.height - (coach.y + coach.height)).toBeLessThanOrEqual(24);
  });
});

test.describe("touch tablet 1180x820", () => {
  test.use({ viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true });

  test("press and hold shows the whole card without playing it", async ({ page }) => {
    await startVsAi(page);
    await completeSetup(page);
    await fillHand(page, 6);
    const clipped = (await clippedRules(page))[0] ?? "";
    expect(clipped).not.toBe("");
    const card = page.locator(".hand .card:not(.peek)", { hasText: clipped }).first();
    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;

    // A real touch press, held; Playwright's touchscreen API only taps.
    const cdp = await page.context().newCDPSession(page);
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    const peek = page.locator(".hand .peek");
    await expect(peek).toBeVisible();
    await expect(peek).toContainText(clipped);
    expect(await peek.locator(".rules").evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(peek).toBeHidden();
    await expect(card).toHaveAttribute("aria-pressed", "false");
  });
});

test.describe("phone portrait 412x915", () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });

  test("compact sheet, scoreboard, slide-over panel and touch targets", async ({ page }) => {
    await startVsAi(page);
    await completeSetup(page);
    const peek = await boardBox(page);
    expect(peek.height).toBeGreaterThanOrEqual(0.6 * 915);

    // Opponent strip: both players with Renown, the human's turn marked.
    const chips = page.getByRole("list", { name: "Scoreboard" }).getByRole("listitem");
    await expect(chips).toHaveCount(2);
    await expect(page.locator(".scoreboard [aria-current='true']")).toContainText("Alice");
    await expect(chips.first()).toContainText(/\d+/);

    // The tray with harvest preview and hand opens over the board without
    // resizing it, and the primary action stays reachable.
    await fillHand(page);
    const tray = page.getByRole("button", { name: /^Hand \d/ });
    await expect(tray).toHaveAttribute("aria-expanded", "false");
    await tray.click();
    await expect(tray).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("region", { name: "Your hand" })).toBeInViewport();
    expect((await boardBox(page)).height).toBe(peek.height);
    await expectInViewport(page, /Assign Banners →/);
    await tray.click();

    // Touch-target audit with a tool armed.
    await page.getByRole("button", { name: /Build Route/ }).click();
    await expectInViewport(page, /Assign Banners →/);
    const small = await page.locator(".game button:visible:not([disabled])").evaluateAll((els) =>
      els
        .filter((el) => !el.closest("svg") && !el.closest("[inert]"))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width < 44 || r.height < 44)
        .map(({ el, r }) => `${el.getAttribute("aria-label") ?? el.textContent?.trim()} ${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    expect(small).toEqual([]);
    await page.getByRole("button", { name: /Cancel/ }).click();

    // Slide-over panel: below the top bar, unreachable while closed, and
    // closable by the scrim and Escape.
    const side = page.locator(".side");
    const playersTab = page.getByRole("tab", { name: "Players", includeHidden: true });
    await playersTab.evaluate((el) => (el as HTMLElement).focus());
    expect(await playersTab.evaluate((el) => el === document.activeElement)).toBe(false);
    await expect(side).toBeHidden();

    await page.getByRole("button", { name: "Panels" }).click();
    await expect(side).toBeVisible();
    const topbarBottom = await page.locator(".topbar").evaluate((el) => el.getBoundingClientRect().bottom);
    const sideTop = await side.evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(sideTop - topbarBottom)).toBeLessThanOrEqual(1);
    // The panel covers most of the scrim on a phone; tap the strip left of it.
    await page.getByRole("button", { name: "Close panels" }).click({ position: { x: 20, y: 200 } });
    await expect(side).toBeHidden();
    await page.getByRole("button", { name: "Panels" }).click();
    await expect(side).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(side).toBeHidden();
  });
});

test.describe("small phone 360x740", () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  test("new game screen fits the width", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New game" }).click();
    await page.getByRole("radio", { name: "4", exact: true }).check({ force: true });
    await page.getByText("Advanced").click();
    expect(await pageFits(page).then((f) => f.scrollsX)).toBe(false);
    const begin = page.getByRole("button", { name: "Begin" });
    await begin.scrollIntoViewIfNeeded();
    await expectInViewport(page, /^Begin$/);
    for (const n of ["2", "3", "4"]) {
      const box = await page.locator(".count label", { hasText: n }).boundingBox();
      expect(box && box.width >= 44 && box.height >= 44).toBe(true);
    }
  });

  test("four players and large text still fit the phone HUD", async ({ page }) => {
    await startVsAi(page, 4);
    await completeSetup(page);
    // Every name keeps a few letters, and the player to act is in view.
    const names = page.locator(".scoreboard .name");
    await expect(names).toHaveCount(4);
    const ems = await names.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width / parseFloat(getComputedStyle(el).fontSize)));
    for (const w of ems) expect(w).toBeGreaterThanOrEqual(2.4);
    const active = page.locator(".scoreboard [aria-current='true']");
    await expect(active).toBeInViewport({ ratio: 1 });

    await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "1.5"));
    await expectInViewport(page, /^Hand \d/);
    await expectInViewport(page, /Assign Banners →/);
    await expect(active).toBeInViewport({ ratio: 1 });
    expect(await pageFits(page)).toEqual({ scrollsX: false, scrollsY: false });
  });
});
