import { expect, test, type Page } from "@playwright/test";
import { pick } from "./pick";

// The Crown's Voice (experimental, spec §129.7): offered under New Game >
// Advanced for local games, shown as a chip in the top bar and told in the
// Chronicle as each round begins.

const VOICE = /^The Crown favours (Might|Roads|Plenty) \(next: (Might|Roads|Plenty)\)$/;

async function start(page: Page, voice: boolean) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", privacyCurtain: false, sound: false }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
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

test("the Crown's Voice shows this round's virtue and the next, and turns as a round begins", async ({ page }) => {
  await start(page, true);
  const chip = page.locator(".topbar .voice .text");
  await expect(chip).toHaveText(VOICE);
  const next = VOICE.exec((await chip.textContent()) ?? "")?.[2];
  await expect(page.locator(".topbar .voice")).toHaveAttribute("title", /Crown's purse: \d+ Favour/);

  // Both players end their turns: round 2 begins with the virtue shown as next.
  await endTurn(page);
  await endTurn(page);
  await expect(chip).toHaveText(new RegExp(`^The Crown favours ${next} \\(next: `));
  await page.getByRole("tab", { name: "Chronicle", exact: true }).click();
  await expect(page.locator(".log ol li", { hasText: `The Crown now favours ${next}, and ` })).toHaveCount(1);
});

test("games without the Crown's Voice show no chip", async ({ page }) => {
  await start(page, false);
  await expect(page.locator(".topbar .voice")).toHaveCount(0);
});
