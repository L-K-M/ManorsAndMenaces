import { expect, test, type Locator, type Page } from "@playwright/test";
import { BALANCE } from "@manors-menaces/rules";
import { pick, selectBanner } from "./pick";
import { acknowledgePlays } from "./plays";

// Responsive game layout (spec §53): the board stays the hero on every screen,
// never rescales while you play, and every HUD control is reachable.

async function startVsAi(page: Page, players = 2) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: false, bannerWarning: false }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: String(players), exact: true }).check({ force: true });
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("layout-seed-18");
  await page.getByRole("button", { name: "Begin" }).click();
}

async function status(page: Page): Promise<string> {
  // Setup can end between locator calls; read its transient status atomically.
  return page.locator(".actions .status").evaluateAll((els) => els[0]?.textContent ?? "");
}

/** Plays the human's setup; the AI plays its own, and any card it plays waits for OK. Ends in the first Main phase. */
async function completeSetup(page: Page) {
  const main = page.getByRole("button", { name: /Assign Banners →/ });
  for (let k = 0; k < 40 && !(await main.count()); k++) {
    const s = await status(page);
    if (/place a Manor/.test(s)) await pick(page.locator(".site.hl").first());
    else if (/free Route/.test(s)) await pick(page.locator(".route.hl").first());
    else if (/starting Banners/.test(s)) {
      const n = await page.locator(".banner.hl").count();
      for (let i = 0; i < n; i++) {
        if (!(await selectBanner(page, page.locator(".banner.hl").nth(i)))) continue;
        const regions = page.locator(".region.hl");
        if (await regions.count()) await pick(regions.first());
      }
      await page.getByRole("button", { name: /Confirm Banners/ }).click();
    } else if (!(await acknowledgePlays(page))) await page.waitForTimeout(250);
  }
  await expect(main).toBeVisible();
}

/**
 * Cards every deck holds, whatever the seats and Menaces: 2-player decks
 * leave out cards that need a missing Menace or a pair of them. Ragnarök
 * waits outside the deck, where the debug draw finds it too. The longest
 * rules texts come early, so the bigger hands test them.
 */
const ALWAYS_DEALT = [
  "raiders",
  "siege_fireball",
  "wizard_interference",
  "knight_errant",
  // The press-and-hold tests need this playable card in the first five.
  "festival_at_the_inn",
  "druids_blessing",
  "arcane_exchange",
  "very_minor_prophecy",
  "fog_of_confusion",
  "royal_insurance_policy",
  "fire_bolt",
  "dragons_landing",
  "the_plague",
  "changeling",
  "transmutation_magic",
  "robin_of_the_glade",
  "unreliable_bard",
  "ragnarok",
];

/** Grants resources and draws cards through the debug panel (§100). */
async function fillHand(page: Page, count = 4) {
  await page.getByRole("button", { name: "Debug" }).click();
  const dialog = page.getByRole("dialog", { name: "Debug tools" });
  await dialog.getByRole("button", { name: "Grant 5 of each resource" }).click();
  for (let i = 0; i < count; i++) {
    await dialog.getByLabel("Card").selectOption(ALWAYS_DEALT[i % ALWAYS_DEALT.length] ?? "");
    await dialog.getByRole("button", { name: "Draw specific card" }).click();
  }
  await dialog.getByRole("button", { name: "Close" }).click();
  // The hand header and the phone tray toggle both show the count.
  await expect(page.getByText(new RegExp(`\\b${count + BALANCE.initialCards}/7\\b`)).first()).toBeVisible();
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

/** Names of the hand's cards whose title text runs past the card's edge. */
async function clippedTitles(page: Page) {
  return page.locator(".hand .card:not(.peek) .title").evaluateAll((els) =>
    els
      .filter((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect();
        const face = el.closest(".face")!.getBoundingClientRect();
        return text.left < face.left - 1 || text.right > face.right + 1 || text.top < face.top - 1 || text.bottom > face.bottom + 1;
      })
      .map((el) => el.textContent ?? ""),
  );
}

/** Presses a card with a finger and keeps it down; Playwright's touchscreen API only taps. */
async function holdCard(page: Page, card: Locator) {
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  if (!box) throw new Error("the card is not on screen");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  return { lift: () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }) };
}

const HOLD_HINT = "Touch and hold a card to read it.";

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
    await expect(page.getByRole("button", { name: /End Turn/ })).toBeVisible();
    const banners = await boardBox(page);

    for (const b of [main, cards, banners]) expect(Math.abs(b.height - setup.height)).toBeLessThanOrEqual(1);
    expect(setup.height).toBeGreaterThanOrEqual(0.55 * 720);
    expect(await pageFits(page)).toEqual({ scrollsX: false, scrollsY: false });

    // Docked cards show title and painting at a readable size, never a cut-off
    // fragment of their rules; a mouse needs no touch hint.
    await expect(page.locator(".hand .card:not(.peek) .rules")).toHaveCount(0);
    expect(await clippedTitles(page)).toEqual([]);
    const titlePx = await page.locator(".hand .card:not(.peek) .title").evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    for (const px of titlePx) expect(px).toBeGreaterThanOrEqual(15);
    await expect(page.getByText(HOLD_HINT)).toBeHidden();

    // The Text size setting scales the dock, but never starves the board.
    await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "1.5"));
    expect((await boardBox(page)).height).toBeGreaterThanOrEqual(0.4 * 720);
    expect(await pageFits(page)).toEqual({ scrollsX: false, scrollsY: false });
    await expectInViewport(page, /End Turn/);
    expect(await clippedTitles(page)).toEqual([]);
  });

  test("cards on the table open in the card viewer", async ({ page }) => {
    await startVsAi(page);
    await completeSetup(page);
    // Royal Insurance Policy is a Charter: played, it lies in front of Alice.
    await page.getByRole("button", { name: "Debug" }).click();
    const debug = page.getByRole("dialog", { name: "Debug tools" });
    await debug.getByLabel("Card").selectOption("royal_insurance_policy");
    await debug.getByRole("button", { name: "Draw specific card" }).click();
    await debug.getByRole("button", { name: "Close" }).click();
    await page.locator(".hand button.card", { hasText: "Royal Insurance Policy" }).click();
    const charter = page.getByRole("button", { name: /^Alice's Charter, Royal Insurance Policy/ });
    await expect(charter).toBeVisible();

    const aside = page.getByRole("button", { name: /^Set aside until the omen: Ragnarök/ });
    for (const [button, name] of [[charter, "Royal Insurance Policy"], [aside, "Ragnarök"]] as const) {
      await button.click();
      const viewer = page.getByRole("dialog", { name });
      await expect(viewer).toBeVisible();
      const rules = viewer.locator(".rules");
      await expect(rules).toBeVisible();
      expect(await rules.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
      await page.keyboard.press("Escape");
      await expect(viewer).toBeHidden();
      await expect(button).toBeFocused();
    }
  });

  test("your resources stay in view whichever panel tab is open", async ({ page }) => {
    await startVsAi(page);
    await completeSetup(page);
    await fillHand(page, 1);
    for (const tab of ["Quests", "Chronicle", "Players"]) {
      await page.getByRole("tab", { name: tab }).click();
      const mine = page.getByLabel("Your resources", { exact: true });
      await expect(mine).toBeInViewport({ ratio: 1 });
      const counts = await mine.locator("span").allTextContents();
      expect(counts).toHaveLength(5);
      // The debug grant gave at least 5 of each.
      for (const c of counts) expect(Number(c)).toBeGreaterThanOrEqual(5);
    }
  });

  test("the hint toast lets clicks through to the board", async ({ page }) => {
    await startVsAi(page);
    await completeSetup(page);
    await fillHand(page, 1);
    await page.getByRole("toolbar", { name: "Actions" }).getByRole("button", { name: /^Build Route/ }).click();
    const hint = page.locator(".toasts .hint").first();
    await expect(hint).toBeVisible();
    const box = (await hint.boundingBox())!;
    // Only Cancel takes the pointer; the rest of the toast is see-through.
    const through = await page.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest(".toasts"), { x: box.x + 6, y: box.y + box.height / 2 });
    expect(through).toBe(true);
  });

  test("tool costs stay in the buttons' accessible names", async ({ page }) => {
    await startVsAi(page);
    await completeSetup(page);
    // Affordable tools name their cost; unaffordable ones say what is missing.
    await fillHand(page, 0);
    const tools = page.getByRole("toolbar", { name: "Actions" });
    await expect(tools.getByRole("button", { name: /^Build Route\s*1 Timber, 1 Stone$/ })).toBeVisible();
    await expect(tools.getByRole("button", { name: /^Market\s*\d+ trades left$/ })).toBeVisible();
    // The cost's text is for screen readers: sighted players get the price chips.
    const cost = tools.getByText("1 Timber, 1 Stone", { exact: true });
    expect(await cost.evaluate((e) => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  });
});

/** Prices remain legible within each button, including disabled actions. */
async function expectPrices(page: Page) {
  const prices = {
    "Build Route": BALANCE.costs.route,
    "Build Manor": BALANCE.costs.manor,
    "Upgrade to Stronghold": BALANCE.costs.stronghold,
    "Royal Writ": BALANCE.costs.royalWrit,
    "Hire a Warden": BALANCE.costs.warden,
    "Buy Card": BALANCE.costs.card,
  };
  const tools = page.getByRole("toolbar", { name: "Actions" });
  for (const [name, cost] of Object.entries(prices)) {
    const button = tools.getByRole("button", { name: new RegExp(`^${name}`) });
    await button.scrollIntoViewIfNeeded();
    const chips = button.locator(".chips");
    await expect(chips).toBeVisible();
    for (const [resource, amount] of Object.entries(cost)) {
      const chip = chips.locator(".chip").filter({ has: page.locator(`[data-resource="${resource}"]`) });
      await expect(chip).toHaveText(String(amount));
      const outer = (await button.boundingBox())!;
      const inner = (await chip.boundingBox())!;
      expect(inner.x).toBeGreaterThanOrEqual(outer.x);
      expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);
      expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height);
    }
  }
  await expect(tools.getByRole("button", { name: /^Royal Writ/ }).locator(".any"))
    .toHaveText(`+${BALANCE.costs.royalWritBribe} any`);
}

test.describe("laptop 1366x768", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("purchase prices remain visible alongside trade shortcuts and at large text", async ({ page }) => {
    await startVsAi(page);
    await expect(page.locator(".site.hl").first()).toBeVisible();
    const setup = await boardBox(page);
    await completeSetup(page);
    await expect(page.locator(".tools .chip.lack").first()).toBeVisible();
    await expectPrices(page);
    expect(Math.abs((await boardBox(page)).height - setup.height)).toBeLessThanOrEqual(1);
    await fillHand(page, 0);
    await expect(page.locator(".tools .chip.lack")).toHaveCount(0);
    for (const width of [1920, 1360, 1024]) {
      await page.setViewportSize({ width, height: 768 });
      await page.evaluate(() => document.documentElement.style.setProperty("--text-scale", "1.5"));
      await expectPrices(page);
      expect(await pageFits(page)).toEqual({ scrollsX: false, scrollsY: false });
      await expectInViewport(page, /Assign Banners →/);
    }
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
    // The rail's tray scrolls, so its cards have room for all their rules,
    // at 14 px or more.
    expect(await clippedRules(page)).toEqual([]);
    const rulesPx = await page.locator(".hand .card:not(.peek) .rules").evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
    for (const px of rulesPx) expect(px).toBeGreaterThanOrEqual(14);
    // End Turn confirms the Banners and stops in the End phase: the hand is over the limit.
    await page.getByRole("button", { name: /Assign Banners →/ }).click();
    await page.getByRole("button", { name: /End Turn/ }).click();
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

  test("press and hold opens the whole card, which stays until closed, without playing it", async ({ page }) => {
    await startVsAi(page);
    await completeSetup(page);
    await fillHand(page, 6);
    // The dock leaves the rules out rather than cutting them short, and says
    // how to read them on a touch screen.
    await expect(page.locator(".hand .card:not(.peek) .rules")).toHaveCount(0);
    await expect(page.getByText(HOLD_HINT)).toBeVisible();

    // Festival at the Inn is playable: a tap would start it.
    const card = page.locator(".hand .card:not(.peek)", { hasText: "Festival at the Inn" }).first();
    const held = await holdCard(page, card);
    const viewer = page.getByRole("dialog", { name: "Festival at the Inn" });
    await expect(viewer.locator(".face")).toBeVisible();
    await held.lift();
    await page.waitForTimeout(600);
    await expect(viewer.locator(".face")).toBeVisible();
    const rules = viewer.locator(".rules");
    expect(await rules.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
    expect(await rules.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    await expect(card).toHaveAttribute("aria-pressed", "false");
    await expect(viewer.getByRole("button", { name: "Timber" })).toHaveCount(0);

    await viewer.getByRole("button", { name: "Close" }).tap();
    await expect(viewer).toBeHidden();
    await expect(card).toBeFocused();
    await expect(card).toHaveAttribute("aria-pressed", "false");
  });

  test("a press that slides off a card before the hold shows no preview", async ({ page }) => {
    await startVsAi(page);
    await completeSetup(page);
    await fillHand(page, 2);
    const card = page.locator(".hand .card:not(.peek)").first();
    const box = await card.boundingBox();
    expect(box).toBeTruthy();
    if (!box) return;

    // A pen is not captured by the card, so it leaves while still pressed.
    const cdp = await page.context().newCDPSession(page);
    const pen = { button: "left", pointerType: "pen", clickCount: 1, buttons: 1 } as const;
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x + box.width / 2, y: box.y + box.height / 2, ...pen });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x + box.width / 2, y: box.y - 120, ...pen });
    await page.waitForTimeout(700);
    await expect(page.locator(".hand .peek")).toBeHidden();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x + box.width / 2, y: box.y - 120, ...pen, buttons: 0 });
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
    // Escape closes the tray, like the slide-over panel, and focus in the
    // tray moves back to its toggle.
    await page.getByRole("region", { name: "Your hand" }).getByRole("button").first().focus();
    await page.keyboard.press("Escape");
    await expect(tray).toHaveAttribute("aria-expanded", "false");
    await expect(tray).toBeFocused();

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
    const side = page.locator("#side-panel");
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

  test("the tray's wide cards read at 14 px, and a held card opens until closed", async ({ page }) => {
    await startVsAi(page);
    await completeSetup(page);
    // The first five dealt include Festival at the Inn, playable now.
    await fillHand(page, 5);
    const peekHeight = (await boardBox(page)).height;
    const tray = page.getByRole("button", { name: /^Hand \d/ });
    await tray.click();
    const hand = page.getByRole("region", { name: "Your hand" });
    await expect(hand.getByText(HOLD_HINT)).toBeVisible();
    const cards = page.locator(".hand .card:not(.peek)");
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded();
      const facts = await card.evaluate((el) => {
        const px = (sel: string) => parseFloat(getComputedStyle(el.querySelector(sel)!).fontSize);
        const rules = el.querySelector(".rules")!;
        return { width: el.getBoundingClientRect().width, rules: px(".rules"), title: px(".title"), clipped: rules.scrollHeight > rules.clientHeight + 1 };
      });
      expect(facts.width).toBeGreaterThanOrEqual(0.6 * 412);
      expect(facts.rules).toBeGreaterThanOrEqual(14);
      expect(facts.title).toBeGreaterThanOrEqual(15);
      expect(facts.clipped).toBe(false);
    }
    expect((await boardBox(page)).height).toBe(peekHeight);

    // Held, a card opens in the viewer and stays after the finger lifts.
    // The backdrop and Escape close it too, and a plain tap still plays.
    const card = cards.filter({ hasText: "Festival at the Inn" }).first();
    await card.scrollIntoViewIfNeeded();
    const viewer = page.getByRole("dialog", { name: "Festival at the Inn" });
    for (const close of ["backdrop", "Escape"] as const) {
      const held = await holdCard(page, card);
      await expect(viewer.locator(".face")).toBeVisible();
      await held.lift();
      await page.waitForTimeout(600);
      await expect(viewer.locator(".face")).toBeVisible();
      await expect(card).toHaveAttribute("aria-pressed", "false");
      if (close === "backdrop") await page.locator(".backdrop").tap({ position: { x: 10, y: 10 } });
      else await page.keyboard.press("Escape");
      await expect(viewer).toBeHidden();
      await expect(tray).toHaveAttribute("aria-expanded", "true");
    }
    await card.tap();
    await expect(page.getByRole("dialog", { name: "Festival at the Inn" }).getByRole("button", { name: "Timber" })).toBeVisible();
  });

  test("tapping a player on the scoreboard shows where their Renown comes from", async ({ page }) => {
    await startVsAi(page);
    await completeSetup(page);
    const chips = page.getByRole("list", { name: "Scoreboard" }).getByRole("button");
    await expect(chips).toHaveCount(2);

    // Each player founds two Manors in setup, and nothing else scores yet.
    for (let i = 0; i < 2; i++) {
      const chip = chips.nth(i);
      const name = (await chip.locator(".name").textContent()) ?? "";
      await chip.click();
      const dialog = page.getByRole("dialog", { name: `Renown of ${name}` });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(/\b2 of \d+ Renown/);
      await expect(dialog.getByRole("row")).toHaveCount(1);
      await expect(dialog.getByRole("row", { name: /Manors/ })).toContainText(/×2\s*\+2/);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(chip).toBeFocused();
    }
  });

  test("purchase prices remain visible on phone action tiles", async ({ page }) => {
    await startVsAi(page);
    await completeSetup(page);
    await expectPrices(page);
    await fillHand(page, 0);
    await expect(page.locator(".tools .chip.lack")).toHaveCount(0);
    await expectPrices(page);
    expect(await pageFits(page)).toEqual({ scrollsX: false, scrollsY: false });
    await expectInViewport(page, /Assign Banners →/);
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

  test("the player to act is never clipped by a fraction of a pixel", async ({ page }) => {
    // Scroll offsets snap to whole pixels, so scrolling the strip by a
    // fractional distance can leave the active chip a sliver short of the
    // edge. Which Text size hits that depends on the browser's font metrics
    // (150% in CI's Chrome); scales past the slider's 150% stand in for them.
    await startVsAi(page, 4);
    await completeSetup(page);
    const active = page.locator(".scoreboard [aria-current='true']");
    for (let scale = 1.5; scale <= 2; scale += 0.05) {
      await page.evaluate((s) => document.documentElement.style.setProperty("--text-scale", String(s)), scale);
      await expect(active, `text scale ${scale.toFixed(2)}`).toBeInViewport({ ratio: 1 });
    }
  });
});
