import { expect, test, type Locator, type Page } from "@playwright/test";
import { pick } from "./pick";

// The third wave of cards (spec §19.22–19.27), and The Dowager (§19.28),
// played through the UI. Two human seats share the screen and nobody is dealt
// cards, so no Counterspell can interrupt; the debug panel (§100) deals the
// card under test.

/** A 2-player hot-seat game past setup, in the first player's Main phase; `seed` fixes the island and the opening. */
async function start(page: Page, seed?: string) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", privacyCurtain: false, sound: false, rivalChatter: false }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
  await page.getByText("Advanced", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Starting cards and regular draws" }).uncheck();
  if (seed) await page.getByLabel(/Seed/).fill(seed);
  await page.getByRole("button", { name: "Begin", exact: true }).click();
  for (let step = 0; step < 20 && !(await page.getByRole("button", { name: /Assign Banners →/ }).count()); step++) {
    const status = await page.locator(".actions .status").evaluateAll((els) => els[0]?.textContent ?? "");
    if (/place a Manor/.test(status)) await pick(page.locator(".site.hl").first());
    else if (/free Route/.test(status)) await pick(page.locator(".route.hl").first());
    else if (/starting Banners/.test(status)) await page.getByRole("button", { name: /Confirm Banners/ }).click();
  }
  await expect(page.getByRole("button", { name: /Assign Banners →/ })).toBeVisible();
}

/** Opens the debug panel, runs `act` in it and closes it. */
async function debug(page: Page, act: (panel: Locator) => Promise<void>) {
  await page.getByRole("button", { name: "Debug", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Debug tools" });
  await act(panel);
  await panel.getByRole("button", { name: "Close", exact: true }).click();
}

const drawCard = async (panel: Locator, id: string) => {
  await panel.getByRole("combobox", { name: "Card", exact: true }).selectOption(id);
  await panel.getByRole("button", { name: "Draw specific card" }).click();
};

/** Points the debug tools at the second seat and returns that player's name. */
async function secondSeat(panel: Locator): Promise<string> {
  const players = panel.getByRole("combobox", { name: "Player", exact: true });
  await players.selectOption({ index: 1 });
  return ((await players.locator("option").nth(1).textContent()) ?? "").trim();
}

async function showHand(page: Page) {
  const toggle = page.locator(".tray-toggle");
  if ((await toggle.isVisible()) && (await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}

const handCard = (page: Page, id: string) => page.locator(".hand button.card").filter({ has: page.locator(`[data-card-art="${id}"]`) });

async function endTurn(page: Page) {
  await page.getByRole("button", { name: /Assign Banners →/ }).click();
  await page.getByRole("button", { name: /End Turn/ }).click();
  await expect(page.getByRole("button", { name: /Assign Banners →/ })).toBeVisible();
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  return errors;
}

test("Sabotage is played from the hand and burns a rival's Grain", async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  let rival = "";
  await debug(page, async (panel) => {
    await drawCard(panel, "sabotage");
    rival = await secondSeat(panel);
    await panel.getByRole("button", { name: "Grant 5 of each resource" }).click();
  });

  await showHand(page);
  const card = handCard(page, "sabotage");
  await expect.poll(() => card.locator(".card-art img").evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(600);
  await card.click();

  const dialog = page.getByRole("dialog", { name: "Sabotage" });
  const target = dialog.getByRole("button", { name: new RegExp(rival) });
  await expect(target).toContainText(/\d+ Grain/);
  const grain = Number(/(\d+) Grain/.exec((await target.textContent()) ?? "")?.[1]);
  expect(grain).toBeGreaterThanOrEqual(5);
  await target.click();
  await expect(dialog).toBeHidden();

  await expect(card).toHaveCount(0);
  await page.getByRole("tab", { name: "Chronicle" }).click();
  await expect(page.locator(".log")).toContainText(`burned down ${rival}'s grain silo: 2 Grain lost.`);
  expect(errors).toEqual([]);
});

test("a Siege Fireball leaves a ruin that nobody may build on", async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await endTurn(page);

  // The second seat builds a third Manor, so a Manor of theirs may burn.
  await debug(page, async (panel) => {
    for (let i = 0; i < 2; i++) await panel.getByRole("button", { name: "Grant 5 of each resource" }).click();
  });
  const manorTool = page.getByRole("button", { name: /^Build Manor/ });
  const routeTool = page.getByRole("button", { name: /^Build Route/ });
  // A second click on an armed tool puts it away.
  const arm = async (tool: Locator) => {
    if (!/\bon\b/.test((await tool.getAttribute("class")) ?? "")) await tool.click();
  };
  for (let i = 0; i < 8 && (await page.locator(".site .holding").count()) < 5; i++) {
    if (await manorTool.isEnabled()) {
      await arm(manorTool);
      if (await page.locator(".site.hl").count()) {
        await pick(page.locator(".site.hl").first());
        continue;
      }
    }
    await arm(routeTool);
    await pick(page.locator(".route.hl").first());
  }
  await expect(page.locator(".site .holding")).toHaveCount(5);
  await endTurn(page);

  // The first seat, well behind, casts the Siege Fireball.
  let rival = "";
  await debug(page, async (panel) => {
    await drawCard(panel, "siege_fireball");
    rival = await secondSeat(panel);
    await panel.getByRole("spinbutton", { name: "Bonus Renown" }).fill("5");
    await panel.getByRole("button", { name: "Set bonus Renown" }).click();
  });
  await showHand(page);
  await handCard(page, "siege_fireball").click();
  await expect(page.locator(".site.hl")).toHaveCount(3);
  const target = page.locator(".site.hl").first();
  const siteLabel = (await target.getAttribute("aria-label")) ?? "";
  expect(siteLabel).toContain(`Manor of ${rival}`);
  await pick(target);
  const confirm = page.getByRole("dialog", { name: "Siege Fireball" });
  await expect(confirm).toContainText("lies in ruins for the rest of the game");
  await confirm.getByRole("button", { name: "Play Siege Fireball" }).click();
  await expect(confirm).toBeHidden();

  const ruin = page.locator(".site", { has: page.locator(".ruin") });
  await expect(ruin).toHaveCount(1);
  await expect(ruin).toHaveAttribute("aria-label", /, in ruins$/);
  await expect(page.locator(".site .holding")).toHaveCount(4);
  await page.getByRole("tab", { name: "Chronicle" }).click();
  await expect(page.locator(".log")).toContainText("lies in ruins: nobody may build there again.");
  await endTurn(page);

  // Its owner still has a Route to the Site, yet may not build there again.
  await debug(page, async (panel) => {
    await panel.getByRole("button", { name: "Grant 5 of each resource" }).click();
  });
  if (await manorTool.isEnabled()) {
    await manorTool.click();
    await expect(ruin).not.toHaveClass(/\bhl\b/);
  }
  await pick(ruin);
  await expect(page.getByText("In ruins: nobody may build here again").first()).toBeVisible();
  await expect(ruin.locator(".holding")).toHaveCount(0);
  await expect(page.locator(".site .holding")).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("The Dowager builds a Manor beside her player's Stronghold", async ({ page }) => {
  const errors = collectErrors(page);
  // On this seed's island the first player's opening leaves one Site for her.
  await start(page, "e2e-dowager");
  await debug(page, async (panel) => {
    for (let i = 0; i < 2; i++) await panel.getByRole("button", { name: "Grant 5 of each resource" }).click();
    await drawCard(panel, "the_dowager");
  });
  // Both of the first player's Manors become Strongholds.
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: /^Upgrade to Stronghold/ }).click();
    await pick(page.locator(".site.hl").first());
  }
  await expect(page.locator(".site .holding")).toHaveCount(4);

  await showHand(page);
  const card = handCard(page, "the_dowager");
  // Her painting is still to be made: the Hero emblem stands in, and no image is requested.
  await expect(card.locator(".card-art img")).toHaveCount(0);
  await card.click();
  await expect(page.getByText("Choose a Site at the far end of your Route from one of your Strongholds.").first()).toBeVisible();
  await expect(page.locator(".site.hl")).toHaveCount(1);
  await pick(page.locator(".site.hl").first());

  await expect(card).toHaveCount(0);
  await expect(page.locator(".site .holding")).toHaveCount(5);
  await page.getByRole("tab", { name: "Chronicle" }).click();
  await expect(page.locator(".log")).toContainText("played The Dowager.");
  expect(errors).toEqual([]);
});
