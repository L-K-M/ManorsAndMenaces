import { expect, test, type Page } from "@playwright/test";

// Hot-seat privacy (§56.1): with two humans and an AI sharing one device, the
// screen may only show the private information of the human who has taken
// the device. During AI turns and behind the curtain no hand is shown, and
// the curtain is a real modal that keyboard focus cannot leave.

const HUMAN_1 = "Alice";
const HUMAN_2 = "Bertram";
const AI = "Cordelia";

async function startTwoHumansAndAi(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "3", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("e2e-hotseat");
  await page.getByRole("button", { name: "Begin" }).click();
}

const curtainButton = (page: Page) => page.getByRole("button", { name: "Tap to begin turn" });

async function status(page: Page): Promise<string> {
  const el = page.locator(".actions .status").first();
  return (await el.count()) ? ((await el.textContent()) ?? "") : "";
}

/** Plays human setup steps and passes curtains until a human's main turn starts. */
async function untilHumanMainTurn(page: Page): Promise<void> {
  for (let k = 0; k < 60; k++) {
    if (await curtainButton(page).count()) await curtainButton(page).click();
    if (await page.getByRole("button", { name: /Assign Banners →/ }).count()) return;
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
    } else await page.waitForTimeout(150);
  }
  throw new Error("no human main turn reached");
}

async function toEndOfTurn(page: Page) {
  await page.getByRole("button", { name: /Assign Banners →/ }).click();
  await page.getByRole("button", { name: /Confirm Banners/ }).click();
}

async function endTurn(page: Page) {
  await toEndOfTurn(page);
  await page.getByRole("button", { name: /End Turn/ }).click();
}

/** Reaches the main turn of HUMAN_2, whose turn is followed by the AI's. */
async function untilSecondHumanTurn(page: Page) {
  for (let turn = 0; turn < 6; turn++) {
    await untilHumanMainTurn(page);
    if ((await page.locator(".hand h3").textContent())?.includes(HUMAN_2)) return;
    await endTurn(page);
  }
  throw new Error(`${HUMAN_2}'s turn not reached`);
}

async function buyCard(page: Page) {
  await page.getByRole("button", { name: "Debug" }).click();
  await page.getByRole("button", { name: "Grant 5 of each resource" }).click();
  await page.getByRole("dialog", { name: "Debug tools" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: /Buy Card/ }).click();
  await expect(page.locator(".hand button.card")).toHaveCount(1);
}

interface Snapshot {
  title: string;
  cards: number;
  curtain: boolean;
  status: string;
}

/** Records what the hand panel shows on every frame rendered after the next click. */
async function recordHandAfterClick(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __snaps: unknown[] };
    w.__snaps = [];
    let clicked = false;
    document.addEventListener("click", () => (clicked = true), { capture: true, once: true });
    const snap = () => {
      if (clicked) w.__snaps.push({
        title: document.querySelector(".hand h3")?.textContent ?? "",
        cards: document.querySelectorAll(".hand button.card").length,
        curtain: !!document.querySelector(".curtain"),
        status: document.querySelector(".actions .status")?.textContent ?? "",
      });
      requestAnimationFrame(snap);
    };
    requestAnimationFrame(snap);
  });
}

const snapshots = (page: Page) => page.evaluate(() => (window as unknown as { __snaps: Snapshot[] }).__snaps);

test("the previous hand stays hidden during the AI turn and behind the curtain", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await startTwoHumansAndAi(page);
  await untilSecondHumanTurn(page);
  await buyCard(page);

  await toEndOfTurn(page);
  await recordHandAfterClick(page);
  await page.getByRole("button", { name: /End Turn/ }).click();
  await expect(curtainButton(page)).toBeVisible();

  const snaps = await snapshots(page);
  expect(snaps.some((s) => s.status.includes(`${AI} is thinking`))).toBe(true);
  const leaks = snaps.filter((s) => s.title.includes(HUMAN_2) || s.cards > 0);
  expect(leaks).toEqual([]);
  await expect(page.locator("section.hand")).toContainText(`hidden until ${HUMAN_1} takes the device`);
  await expect(page.getByRole("dialog", { name: `Pass to ${HUMAN_1}` })).toBeVisible();

  // Reloading a hot-seat game starts behind the curtain too.
  await page.reload();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(curtainButton(page)).toBeVisible();
  await expect(page.locator(".hand button.card")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the privacy curtain holds keyboard focus and locks the board", async ({ page }) => {
  await startTwoHumansAndAi(page);
  await untilSecondHumanTurn(page);
  await endTurn(page);
  const button = curtainButton(page);
  await expect(button).toBeFocused();
  await expect(page.locator(".game")).toHaveAttribute("inert", "");

  for (const key of ["Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    const inCurtain = await page.evaluate(() => !!document.activeElement?.closest(".curtain"));
    expect(inCurtain, `focus left the curtain after ${key}`).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(button).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(button).toHaveCount(0);
  await expect(page.locator(".game")).not.toHaveAttribute("inert", "");
  await expect(page.locator(".hand h3")).toContainText(HUMAN_1);
});

test("a live region announces AI actions and turn changes", async ({ page }) => {
  await startTwoHumansAndAi(page);
  await untilSecondHumanTurn(page);
  await endTurn(page);
  await expect(curtainButton(page)).toBeVisible();
  const region = page.getByRole("log", { name: "Announcements" });
  await expect(region).toHaveAttribute("aria-live", "polite");
  await expect(region).toContainText(`${AI}'s turn`);
  await expect(region).toContainText(`${HUMAN_1}'s turn`);
});
