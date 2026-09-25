import { expect, test, type Locator, type Page } from "@playwright/test";

// Board readability (targets, labels, focus, hover, motion settings).

async function startHotseat(page: Page, settings: Record<string, unknown> = {}) {
  await page.goto("/");
  await page.evaluate((s) => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true, ...s }));
    indexedDB.deleteDatabase("manors-menaces");
  }, settings);
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("e2e-seed");
  await page.getByRole("button", { name: "Begin" }).click();
  await passCurtain(page);
}

async function passCurtain(page: Page) {
  await page
    .getByRole("button", { name: "Tap to begin turn" })
    .click({ timeout: 1500 })
    .catch(() => undefined);
}

async function status(page: Page): Promise<string> {
  const el = page.locator(".actions .status").first();
  return (await el.count()) ? ((await el.textContent()) ?? "") : "";
}

async function completeSetup(page: Page) {
  for (let k = 0; k < 12; k++) {
    await passCurtain(page);
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
    } else break;
  }
  await passCurtain(page);
  await expect(page.getByRole("button", { name: /Assign Banners →/ })).toBeVisible();
}

const runningAnimations = (page: Page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);

/** On-screen font size (CSS px) of the first element matching `selector`. */
const screenFontPx = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const g = el as SVGGraphicsElement;
      return parseFloat(getComputedStyle(g).fontSize) * (g.getScreenCTM()?.a ?? 0);
    });

test.describe("motion settings", () => {
  test("in-app Reduced motion stops board animations", async ({ page }) => {
    await startHotseat(page, { animationSpeed: "normal", reducedMotion: true });
    await expect(page.locator(".site.hl").first()).toBeVisible();
    await page.waitForTimeout(300);
    expect(await runningAnimations(page)).toBe(0);
  });

  test("Animation: Off stops board animations", async ({ page }) => {
    await startHotseat(page, { animationSpeed: "off", reducedMotion: false });
    await expect(page.locator(".site.hl").first()).toBeVisible();
    await page.waitForTimeout(300);
    expect(await runningAnimations(page)).toBe(0);
  });

  test("normal motion keeps the target highlight breathing", async ({ page }) => {
    await startHotseat(page, { animationSpeed: "normal", reducedMotion: false });
    await expect(page.locator(".site.hl").first()).toBeVisible();
    await expect.poll(() => runningAnimations(page)).toBeGreaterThan(0);
  });
});

test.describe("targets", () => {
  test("the board dims around targets and outlines legal Regions", async ({ page }) => {
    await startHotseat(page);
    await completeSetup(page);
    await expect(page.locator(".veil")).toHaveCount(0);

    await page.getByRole("button", { name: /Assign Banners →/ }).click();
    await page.locator(".banner.hl").first().click();
    const legal = await page.locator(".region.hl").count();
    expect(legal).toBeGreaterThan(0);
    await expect(page.locator(".veil")).toHaveCount(1);
    await expect(page.locator(".hl-edge")).toHaveCount(legal);
    const opacity = await page.locator(".veil").evaluate((el) => parseFloat(getComputedStyle(el).opacity));
    expect(opacity).toBeGreaterThanOrEqual(0.2);
  });
});

test.describe("focus", () => {
  test("clicking a board piece leaves no focus rectangle", async ({ page }) => {
    await startHotseat(page);
    await page.locator(".site.hl").first().click();
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
    expect(outline).toBe("none");
  });

  test("Regions and Menaces show a keyboard focus ring", async ({ page }) => {
    await startHotseat(page);
    await completeSetup(page);
    for (const kind of ["region", "menace"]) {
      await page.locator(`.${kind}`).first().focus();
      await page.keyboard.press("Tab");
      const ring = page.locator(`.${kind}:focus-visible .focus-ring`);
      await expect(ring).toHaveCount(1);
      const stroke = await ring.evaluate((el) => getComputedStyle(el).stroke);
      expect(stroke).not.toBe("none");
    }
  });
});

test.describe("labels", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("Region names are legible at 1280x720 and follow Text size", async ({ page, browser }) => {
    await startHotseat(page);
    const base = await screenFontPx(page, ".region-name");
    expect(base).toBeGreaterThanOrEqual(10);

    const large = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await startHotseat(large, { textScale: 1.5 });
    const scaled = await screenFontPx(large, ".region-name");
    expect(scaled).toBeGreaterThanOrEqual(base * 1.3);
    await large.close();
  });

  test("Banners never cover capacity pips", async ({ page }) => {
    await startHotseat(page);
    await completeSetup(page);
    const overlaps = await page.evaluate(() => {
      const pips = [...document.querySelectorAll('.region circle[r="4"]')].map((e) => e.getBoundingClientRect());
      const flags = [...document.querySelectorAll(".banner")].map((e) => e.getBoundingClientRect());
      const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return { pips: pips.length, flags: flags.length, n: flags.filter((f) => pips.some((p) => hit(f, p))).length };
    });
    expect(overlaps.pips).toBeGreaterThan(0);
    expect(overlaps.flags).toBeGreaterThan(0);
    expect(overlaps.n).toBe(0);
  });
});

test.describe("labels on a phone", () => {
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test("names hide at the default view and return when zoomed in", async ({ page }) => {
    await startHotseat(page);
    await expect(page.locator(".site.hl").first()).toBeVisible();
    await expect(page.locator(".region-name")).toHaveCount(0);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.locator(".region-name").first()).toBeVisible();
    expect(await screenFontPx(page, ".region-name")).toBeGreaterThanOrEqual(10);
  });

  test("tapping a Region never shows a hover tooltip", async ({ page }) => {
    await startHotseat(page);
    await completeSetup(page);
    const disc = page.locator('.region circle[r="17"]').nth(4);
    const box = await disc.boundingBox();
    if (!box) throw new Error("region disc not rendered");
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(700);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });
});

test.describe("hover", () => {
  test("hovering a Region shows its details after a short delay", async ({ page }) => {
    await startHotseat(page);
    await completeSetup(page);
    const region = page.locator(".region").nth(4);
    const name = ((await region.getAttribute("aria-label")) ?? "").split(",")[0] ?? "";
    const box = await region.locator('circle[r="17"]').boundingBox();
    if (!box) throw new Error("region disc not rendered");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const tip = page.getByRole("tooltip");
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(name);
    await expect(tip).toContainText(/capacity/i);
    await page.mouse.move(2, 2);
    await expect(tip).toHaveCount(0);
  });

  test("hovering a target Site shows a tooltip", async ({ page }) => {
    await startHotseat(page);
    await page.locator(".site.hl").first().hover();
    await expect(page.getByRole("tooltip")).toContainText(/Touches/);
  });
});

async function debugGrant(page: Page) {
  await page.getByRole("button", { name: "Debug" }).click();
  await page.getByRole("button", { name: "Grant 5 of each resource" }).click();
  await page.getByRole("dialog", { name: "Debug tools" }).getByRole("button", { name: "Close" }).click();
}

/** Centre and box of a Region's resource disc, in page pixels. */
async function discCentre(region: Locator) {
  const box = await region.locator('circle[r="17"]').boundingBox();
  if (!box) throw new Error("region disc not rendered");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe("hover card placement", () => {
  test("clicking a hovered piece swaps the hover card for the inspector", async ({ page }) => {
    await startHotseat(page);
    await completeSetup(page);
    const menace = page.locator(".menace").first();
    await menace.hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await menace.click();
    await expect(page.locator("aside.inspect")).toBeVisible();
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });

  test("the hover card survives a state change under a still pointer", async ({ page }) => {
    await startHotseat(page);
    await completeSetup(page);
    await debugGrant(page);
    await page.getByRole("button", { name: /Build Route/ }).click();
    await page.locator(".route.hl").first().click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
    const { x, y } = await discCentre(page.locator(".region").nth(4));
    await page.mouse.move(x, y);
    const tip = page.getByRole("tooltip");
    await expect(tip).toBeVisible();
    await page.keyboard.press("Control+z");
    await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
    await page.waitForTimeout(200);
    await expect(tip).toBeVisible();
  });

  test.describe("with large text", () => {
    test.use({ viewport: { width: 1400, height: 900 } });

    test("the card stays on the board and off the hovered Region", async ({ page }) => {
      await startHotseat(page, { textScale: 1.5 });
      await completeSetup(page);
      // Zoom in so Regions sit right at the board's edges.
      await page.getByRole("button", { name: "Zoom in" }).click();
      await page.getByRole("button", { name: "Zoom in" }).click();
      await page.mouse.move(2, 2);
      const board = await page.locator("svg.board").boundingBox();
      if (!board) throw new Error("board not rendered");
      const regions = page.locator(".region");
      const inside = (d: { x: number; y: number }) =>
        d.x > board.x + 20 && d.x < board.x + board.width - 20 && d.y > board.y + 20 && d.y < board.y + board.height - 20;
      const discs = (
        await regions.evaluateAll((els) =>
          els.map((el, i) => {
            const r = el.querySelector('circle[r="17"]')!.getBoundingClientRect();
            return { i, x: r.x + r.width / 2, y: r.y + r.height / 2 };
          }),
        )
      ).filter(inside);
      const top = discs.reduce((a, b) => (b.y < a.y ? b : a));
      const left = discs.reduce((a, b) => (b.x < a.x ? b : a));
      const right = discs.reduce((a, b) => (b.x > a.x ? b : a));
      for (const d of [top, left, right]) {
        await page.mouse.move(2, 2);
        await page.mouse.move(d.x, d.y);
        const tip = page.getByRole("tooltip");
        await expect(tip).toBeVisible();
        const card = await tip.boundingBox();
        if (!card) throw new Error("tooltip not rendered");
        const { box: disc } = await discCentre(regions.nth(d.i));
        expect(card.x).toBeGreaterThanOrEqual(board.x);
        expect(card.x + card.width).toBeLessThanOrEqual(board.x + board.width);
        expect(card.y).toBeGreaterThanOrEqual(board.y);
        expect(overlaps(card, disc)).toBe(false);
      }
    });
  });
});

/**
 * Pieces under a harvest note, each taken as a disc of 10 board units around
 * its origin (a Site's centre, a Banner's foot, a Menace's centre).
 */
const coveredPieces = (page: Page) =>
  page.evaluate(() => {
    const notes = [...document.querySelectorAll(".note rect")].map((n) => n.getBoundingClientRect());
    return [...document.querySelectorAll(".site, .banner, .menace")]
      .map((el) => (el as SVGGraphicsElement).getScreenCTM()!)
      .filter((m) => notes.some((r) => Math.hypot(Math.max(r.left - m.e, 0, m.e - r.right), Math.max(r.top - m.f, 0, m.f - r.bottom)) < 10 * m.a)).length;
  });

test.describe("harvest notes", () => {
  test("a note never covers a Site, Banner or Menace", async ({ page }) => {
    await startHotseat(page);
    await completeSetup(page);
    await debugGrant(page);
    // Walk the Toll Troll next to one of my Banners so its Region shows a note.
    await page.getByRole("button", { name: /Hire a Warden/ }).click();
    await page.locator('.menace.hl[aria-label^="Toll Troll"]').click();
    const target = await page.evaluate(() => {
      const mine = [...document.querySelectorAll(".banner.mine")].map((e) => e.getBoundingClientRect());
      const regions = [...document.querySelectorAll(".region.hl")].map((e) => e.querySelector('circle[r="17"]')!.getBoundingClientRect());
      let best = { d: Infinity, i: -1 };
      for (const b of mine)
        regions.forEach((r, i) => {
          const d = Math.hypot(b.x - r.x, b.y - r.y);
          if (d < best.d) best = { d, i };
        });
      return best.i;
    });
    expect(target).toBeGreaterThanOrEqual(0);
    const { x, y } = await discCentre(page.locator(".region.hl").nth(target));
    await page.mouse.click(x, y);
    await page.mouse.move(2, 2);
    // In this crowded Region no slot is clear at the default view, so the note
    // is a badge; zoomed in, it has room for text.
    await expect(page.locator(".note, .note-badge")).toHaveCount(1);
    expect(await coveredPieces(page)).toBe(0);
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect(page.locator(".note")).toHaveCount(1);
    expect(await coveredPieces(page)).toBe(0);
  });
});
