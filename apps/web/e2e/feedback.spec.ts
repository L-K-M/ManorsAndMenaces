import { expect, test, type Page } from "@playwright/test";
import { pick } from "./pick";

// "What just happened?" (spec §50): harvest flights, the action feed, the
// catch-up digest, rivals' next harvest and your own resources on screen.

type Speed = "normal" | "off";

async function start(page: Page, opts: { humans: 1 | 2; speed: Speed; players?: number; seed?: string }) {
  await page.goto("/");
  await page.evaluate((speed) => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: speed, reducedMotion: false, sound: false, privacyCurtain: true }));
    indexedDB.deleteDatabase("manors-menaces");
  }, opts.speed);
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: String(opts.players ?? 2), exact: true }).check({ force: true });
  if (opts.humans === 2) await page.getByLabel("Player 2 type").selectOption("human");
  // Computer seats are named after their rival (#24); keep the names used here.
  const names = ["Alice", "Bertram", "Cordelia", "Dunstan"];
  for (let i = 1; i < (opts.players ?? 2); i++) await page.getByLabel(`Name of player ${i + 1}`).fill(names[i] ?? "");
  await page.getByText("Advanced").click({ force: true });
  await page.getByLabel(/Seed/).fill(opts.seed ?? "e2e-seed");
  await page.getByRole("button", { name: "Begin" }).click({ force: true });
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

/** Plays setup for every human seat; returns once a human's first main phase starts. */
async function completeSetup(page: Page) {
  const ready = page.getByRole("button", { name: /Assign Banners →/ });
  for (let k = 0; k < 40 && !(await ready.isVisible()); k++) {
    await passCurtain(page);
    const s = await status(page);
    if (/place a Manor/.test(s)) await page.locator(".site.hl").first().click();
    else if (/free Route/.test(s)) await pick(page.locator(".route.hl").first());
    else if (/starting Banners/.test(s)) {
      const n = await page.locator(".banner.hl").count();
      for (let i = 0; i < n; i++) {
        await page.locator(".banner.hl").nth(i).click();
        const regions = page.locator(".region.hl");
        if (await regions.count()) await pick(regions.first());
      }
      await page.getByRole("button", { name: /Confirm Banners/ }).click();
    } else await page.waitForTimeout(250);
  }
  await expect(ready).toBeVisible();
}

async function endTurn(page: Page) {
  // The Banner phase's End Turn confirms the Banners and ends the turn.
  await page.getByRole("button", { name: /Assign Banners →/ }).click();
  await page.getByRole("button", { name: /End Turn/ }).click();
}

test("an AI turn shows in the feed and your harvest flies to your counters", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // A seed whose AI builds on its first turn (#22's 2-player deck changed the shuffle).
  await start(page, { humans: 1, speed: "normal", seed: "e2e-seed-7" });
  await completeSetup(page);
  await endTurn(page);

  // Bertram's actions appear as toasts in his colour, and the pieces he
  // changed pulse on the board.
  await expect(
    page
      .locator(".feed")
      .getByText(/^Bertram /)
      .first(),
  ).toBeVisible();
  await expect(page.locator(".fx .pulse").first()).toBeAttached();

  // Back to Alice: her harvest tokens fly, land, and her toast says what came in.
  await expect(page.locator(".fx-token").first()).toBeAttached({ timeout: 20_000 });
  await expect(page.locator(".toast.self")).toContainText("Your harvest");
  await expect(page.locator(".fx-token")).toHaveCount(0, { timeout: 3000 });

  // Once everything has landed the counters agree with Alice's player card.
  const card = page.locator('.player[data-player-target="P1"]');
  for (const r of ["grain", "timber", "stone", "iron", "essence"]) {
    const shown = await card.locator(`[data-res-target="P1:${r}"]`).textContent();
    await expect(page.locator(`.purse [data-res-target="P1:${r}"]`)).toHaveText(shown ?? "");
  }
  expect(errors).toEqual([]);
});

test("a hot-seat harvest waits behind the curtain and plays on reveal", async ({ page }) => {
  await start(page, { humans: 2, speed: "normal" });
  await completeSetup(page);
  await endTurn(page);
  await passCurtain(page);
  // The second player builds a Route, then ends their turn.
  await page.getByRole("button", { name: "Debug" }).click();
  await page.getByRole("button", { name: "Grant 5 of each resource" }).click();
  await page.getByRole("dialog", { name: "Debug tools" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: /Build Route/ }).click();
  await pick(page.locator(".route.hl").first());
  await endTurn(page);

  // The first player's harvest happened behind the curtain: nothing plays yet.
  await expect(page.getByRole("button", { name: "Tap to begin turn" })).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.locator(".fx-token")).toHaveCount(0);
  await expect(page.locator(".toast.self")).toHaveCount(0);

  await passCurtain(page);
  await expect(page.locator(".fx-token").first()).toBeAttached();
  await expect(page.locator(".toast.self")).toContainText("Your harvest");
  // What the other player did meanwhile.
  await expect(page.getByRole("region", { name: "What happened while you were away" })).toContainText(/built a Route/);
});

test("with animation off, harvests update at once and still say what came in", async ({ page }) => {
  await start(page, { humans: 1, speed: "off" });
  await completeSetup(page);
  const tokens: number[] = [];
  await page.exposeFunction("recordTokens", (n: number) => tokens.push(n));
  await page.evaluate(() => {
    new MutationObserver(() =>
      (window as unknown as { recordTokens: (n: number) => void }).recordTokens(document.querySelectorAll(".fx-token").length),
    ).observe(document.body, { childList: true, subtree: true });
  });
  await endTurn(page);
  await expect(page.locator(".toast.self")).toContainText("Your harvest", { timeout: 20_000 });
  expect(Math.max(0, ...tokens)).toBe(0);
});

test("the Players panel shows each rival's next harvest", async ({ page }) => {
  await start(page, { humans: 1, speed: "off", players: 3 });
  await completeSetup(page);
  const rivals = page.locator(".player .next");
  await expect(rivals).toHaveCount(2);
  for (const name of ["Bertram", "Cordelia"]) {
    await expect(page.getByRole("note", { name: new RegExp(`^${name}'s next Harvest: \\d`) })).toBeVisible();
  }
});

test("your resources are on screen without opening the Players panel @mobile", async ({ page }) => {
  await start(page, { humans: 1, speed: "off" });
  await completeSetup(page);
  // The top bar, the board or (#14's rail and sheet) the head of the dock.
  const outsidePanel = page.locator('.topbar [data-res-target="P1:grain"], .board-wrap [data-res-target="P1:grain"], .dock-head [data-res-target="P1:grain"]');
  await expect(outsidePanel.filter({ visible: true })).toHaveCount(1);
});
