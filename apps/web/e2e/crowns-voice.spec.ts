import { expect, test, type Page } from "@playwright/test";
import { pick } from "./pick";

// The Crown's Voice (experimental, spec §129.10): offered under New Game >
// Advanced for local games, shown as a chip in the top bar and told in the
// Chronicle as each round begins.

const VOICE = /^The Crown favours (Might|Roads|Plenty) \(next: (Might|Roads|Plenty)\)$/;

async function start(page: Page, voice: boolean, rules: "Standard" | "Core" = "Standard") {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", privacyCurtain: false, sound: false, bannerWarning: false }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
  await page.getByRole("radio", { name: new RegExp(`^${rules}`) }).check();
  if (voice) {
    await page.getByText("Advanced", { exact: true }).click();
    await page.getByRole("checkbox", { name: "Crown's Voice (experimental)" }).check();
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

async function endTurn(page: Page) {
  await page.getByRole("button", { name: /Assign Banners →/ }).click();
  await page.getByRole("button", { name: /End Turn/ }).click();
}

test("the Crown's Voice waits for the Quest deck to empty in Standard games", async ({ page }) => {
  await start(page, true);
  await expect(page.locator(".topbar .voice .text")).toHaveText(/^Once the Quest deck is empty, the Crown favours (Might|Roads|Plenty) \(next: (Might|Roads|Plenty)\)$/);
});

// Core games have no Quests, so the Voice speaks from the first round.
test("the Crown's Voice shows this round's virtue and the next, and turns as a round begins", async ({ page }) => {
  await start(page, true, "Core");
  const chip = page.locator(".topbar .voice .text");
  await expect(chip).toHaveText(VOICE);
  const next = VOICE.exec((await chip.textContent()) ?? "")?.[2];
  // A tap opens the purse and how each virtue scores.
  await page.locator(".topbar .voice").click();
  const dialog = page.getByRole("dialog", { name: "The Crown's Voice" });
  await expect(dialog).toContainText(/Crown's purse: 15 Favour/);
  await expect(dialog.locator("dt")).toHaveText(["Might", "Roads", "Plenty"]);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);

  // Both players end their turns: round 2 begins with the virtue shown as next.
  await endTurn(page);
  await endTurn(page);
  await expect(chip).toHaveText(new RegExp(`^The Crown favours ${next} \\(next: `));
  await page.getByRole("tab", { name: "Chronicle", exact: true }).click();
  await expect(page.locator(".log ol li", { hasText: `The Crown now favours ${next}, and ` })).toHaveCount(1);
});

// Phones: the chip shows only this round's virtue, so the top bar keeps its
// two rows (buttons, then the scoreboard), and a tap opens the details.
test.describe("the Crown's Voice on a phone", () => {
  test.use({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });

  test("the chip fits a phone's top bar and opens on a tap", async ({ page }) => {
    await start(page, true, "Core");
    // The development-only Debug button is not in a player's top bar.
    await page.getByRole("button", { name: "Debug" }).evaluateAll((els) => els.forEach((el) => ((el as HTMLElement).style.display = "none")));
    const chip = page.locator(".topbar .voice");
    await expect(chip.locator(".tiny")).toBeVisible();
    await expect(chip.locator(".tiny")).toHaveText(/^(Might|Roads|Plenty)$/);
    // Everything but the scoreboard shares the first row: how far each item's
    // middle lies from the menu button's.
    const offsets = await page.locator(".topbar").evaluate((bar) => {
      const middle = (el: Element) => {
        const r = el.getBoundingClientRect();
        return (r.top + r.bottom) / 2;
      };
      const items = Array.from(bar.children).filter((el) => !el.classList.contains("score") && el.getBoundingClientRect().width > 0);
      return items.map((el) => Math.abs(middle(el) - middle(bar.children[0] as Element)));
    });
    expect(Math.max(...offsets)).toBeLessThan(4);
    await chip.tap();
    await expect(page.getByRole("dialog", { name: "The Crown's Voice" })).toContainText(/Crown's purse: 15 Favour/);
  });
});

test("games without the Crown's Voice show no chip", async ({ page }) => {
  await start(page, false);
  await expect(page.locator(".topbar .voice")).toHaveCount(0);
});
