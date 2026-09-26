import { expect, test, type Page } from "@playwright/test";
import { pick } from "./pick";
import { acknowledgePlays, playDialog, untilVisible } from "./plays";

// Other players' cards (player feedback: "you should have to read it and tap
// OK, rather than it just disappearing"): each card another player plays
// shows whole until you tap OK, and a local computer player waits for it.

interface Options {
  humans?: 1 | 2;
  seed?: string;
  pause?: boolean;
}

async function start(page: Page, { humans = 1, seed = "e2e-plays", pause = true }: Options = {}) {
  await page.goto("/");
  await page.evaluate(
    ({ pause }) => {
      localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, rivalChatter: false, privacyCurtain: true, pauseOnCardPlay: pause }));
      indexedDB.deleteDatabase("manors-menaces");
    },
    { pause },
  );
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  if (humans === 2) await page.getByLabel("Player 2 type").selectOption("human");
  await page.getByLabel("Name of player 2").fill("Bertram");
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill(seed);
  await page.getByRole("button", { name: "Begin" }).click();
}

const curtainButton = (page: Page) => page.getByRole("button", { name: "Tap to begin turn" });
const mainPhase = (page: Page) => page.getByRole("button", { name: /Assign Banners →/ });

async function status(page: Page): Promise<string> {
  return page.locator(".actions .status").evaluateAll((els) => els[0]?.textContent ?? "");
}

/** Plays every human's setup; returns once a human's Main phase starts. */
async function completeSetup(page: Page) {
  for (let k = 0; k < 60 && !(await mainPhase(page).isVisible()); k++) {
    if (await curtainButton(page).isVisible()) await curtainButton(page).click();
    await acknowledgePlays(page);
    const s = await status(page);
    if (/place a Manor/.test(s)) await pick(page.locator(".site.hl").first());
    else if (/free Route/.test(s)) await pick(page.locator(".route.hl").first());
    else if (/starting Banners/.test(s)) {
      const n = await page.locator(".banner.hl").count();
      for (let i = 0; i < n; i++) {
        await page.locator(".banner.hl").nth(i).click();
        const regions = page.locator(".region.hl");
        if (await regions.count()) await pick(regions.first());
      }
      await page.getByRole("button", { name: /Confirm Banners/ }).click();
    } else await page.waitForTimeout(200);
  }
  await expect(mainPhase(page)).toBeVisible();
}

async function drawCard(page: Page, player: string, card: string) {
  await page.getByRole("button", { name: "Debug", exact: true }).click();
  const debug = page.getByRole("dialog", { name: "Debug tools" });
  await debug.getByRole("combobox", { name: "Player", exact: true }).selectOption({ label: player });
  await debug.getByRole("combobox", { name: "Card", exact: true }).selectOption(card);
  await debug.getByRole("button", { name: "Draw specific card" }).click();
  await debug.getByRole("button", { name: "Close", exact: true }).click();
}

async function endTurn(page: Page) {
  await mainPhase(page).click();
  await page.getByRole("button", { name: /End Turn/ }).click();
}

async function chronicleLength(page: Page): Promise<number> {
  return page.locator(".log ol li").count();
}

test("a computer's card waits for your OK, then the computer goes on", async ({ page }) => {
  await start(page);
  await completeSetup(page);
  await drawCard(page, "Bertram", "royal_insurance_policy");
  await page.getByRole("tab", { name: "Chronicle", exact: true }).click();
  await endTurn(page);

  const dialog = playDialog(page);
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const title = (await dialog.getAttribute("aria-label")) ?? "";
  expect(title).toMatch(/^Bertram played /);
  const card = title.replace(/^Bertram played /, "");
  await expect(dialog.locator(".full-card .title")).toHaveText(card);
  await expect(dialog.locator(".full-card .rules")).not.toBeEmpty();
  await expect(dialog.getByRole("button", { name: "OK", exact: true })).toBeFocused();

  // Bertram waits for you: nothing more happens while the card is on screen.
  const before = await chronicleLength(page);
  await page.waitForTimeout(2500);
  expect(await chronicleLength(page)).toBe(before);
  await expect(page.getByTestId("turn-status")).toContainText("Bertram");

  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await untilVisible(page, mainPhase(page));
  expect(await chronicleLength(page)).toBeGreaterThan(before);
});

test("a computer's Counterspell on your turn shows as it cancels your Spell", async ({ page }) => {
  await start(page);
  await completeSetup(page);
  await drawCard(page, "Bertram", "counterspell");
  await drawCard(page, "Alice", "fire_bolt");

  await page.locator(".hand button.card", { hasText: "Fire Bolt" }).click();
  await pick(page.locator(".route.hl").first());

  const dialog = playDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-label", "Bertram countered your Fire Bolt");
  await expect(dialog.locator(".full-card .title")).toHaveText("Counterspell");
  await expect(dialog.getByRole("button", { name: "OK", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(mainPhase(page)).toBeVisible();
});

test("in hot-seat, the next player reads the card after revealing their view", async ({ page }) => {
  await start(page, { humans: 2 });
  await completeSetup(page);
  const current = (await page.locator(".hand h3").textContent())?.includes("Alice") ? "Alice" : "Bertram";
  const next = current === "Alice" ? "Bertram" : "Alice";

  await drawCard(page, current, "festival_at_the_inn");
  await page.locator(".hand button.card", { hasText: "Festival at the Inn" }).click();
  await page.getByRole("dialog", { name: "Festival at the Inn", exact: true }).getByRole("button", { name: "Timber", exact: true }).click();
  // Your own card needs no OK.
  await expect(page.locator(".hand button.card", { hasText: "Festival at the Inn" })).toHaveCount(0);
  await expect(playDialog(page)).toHaveCount(0);
  await endTurn(page);

  // Nothing shows behind the curtain; the card waits for the reveal.
  await expect(page.getByRole("dialog", { name: `Pass to ${next}` })).toBeVisible();
  await expect(playDialog(page)).toHaveCount(0);
  await curtainButton(page).click();
  const dialog = playDialog(page);
  await expect(dialog).toHaveAttribute("aria-label", `${current} played Festival at the Inn`);
  await expect(dialog.locator(".full-card .rules")).toContainText("Every player gains 1 Grain");
  await expect(dialog.getByRole("button", { name: "OK", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".hand h3")).toContainText(next);
});

test("with the pause switched off, a computer's card shows no dialog and nobody waits", async ({ page }) => {
  await start(page, { pause: false });
  await completeSetup(page);
  await drawCard(page, "Bertram", "royal_insurance_policy");
  await page.evaluate(() => {
    const w = window as unknown as { __playDialogs: number };
    w.__playDialogs = 0;
    new MutationObserver(() => (w.__playDialogs += document.querySelectorAll('[role="dialog"] .full-card').length)).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole("tab", { name: "Chronicle", exact: true }).click();
  await endTurn(page);

  // Bertram plays and ends his turn without anyone tapping OK.
  await expect(mainPhase(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".log ol li", { hasText: /^Bertram played / })).not.toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __playDialogs: number }).__playDialogs)).toBe(0);
});
