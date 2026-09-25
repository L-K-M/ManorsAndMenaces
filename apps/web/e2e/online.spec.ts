import { expect, test, type Browser, type Page } from "@playwright/test";

// Online play (spec §58–60, §86): two browsers, invite code, synchronized setup.

async function player(browser: Browser, name: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false })));
  await page.reload();
  await page.getByRole("button", { name: "Play online" }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByText("Server", { exact: true }).click();
  await page.getByLabel("Server address").fill("http://localhost:8788");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  return page;
}

async function status(page: Page): Promise<string> {
  const el = page.locator(".actions .status").first();
  return (await el.count()) ? ((await el.textContent()) ?? "") : "";
}

async function playSetup(pages: Page[]) {
  for (let i = 0; i < 12; i++) {
    for (const p of pages) {
      const s = await status(p);
      if (/place a Manor/.test(s)) await p.locator(".site.hl").first().click();
      else if (/free Route/.test(s)) await p.locator(".route.hl").first().click();
      else if (/starting Banners/.test(s)) {
        const n = await p.locator(".banner.hl").count();
        for (let k = 0; k < n; k++) {
          await p.locator(".banner.hl").nth(k).click();
          if (await p.locator(".region.hl").count()) await p.locator(".region.hl").first().click();
        }
        await p.getByRole("button", { name: /Confirm Banners/ }).click();
      }
      await p.waitForTimeout(150);
    }
  }
}

async function startMatch(browser: Browser): Promise<[Page, Page]> {
  const alice = await player(browser, "Alice");
  await alice.getByRole("button", { name: /Create/ }).click();
  const code = ((await alice.locator(".code").textContent()) ?? "").trim();
  const bob = await player(browser, "Bob");
  await bob.getByLabel("Invite code").fill(code);
  await bob.getByRole("button", { name: "Join" }).click();
  await expect(alice.locator(".board")).toBeVisible();
  await expect(bob.locator(".board")).toBeVisible();
  return [alice, bob];
}

async function confirmBanners(page: Page) {
  await page.getByRole("button", { name: /Assign Banners →/ }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: /Confirm Banners/ }).click();
}

test("two players create, join and complete setup online", async ({ browser }) => {
  const alice = await player(browser, "Alice");
  await alice.getByRole("button", { name: /Create/ }).click();
  const code = ((await alice.locator(".code").textContent()) ?? "").trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  const bob = await player(browser, "Bob");
  await bob.getByLabel("Invite code").fill(code);
  await bob.getByRole("button", { name: "Join" }).click();
  await expect(alice.locator(".board")).toBeVisible();
  await expect(bob.locator(".board")).toBeVisible();

  await playSetup([alice, bob]);
  // Exactly one of them is now in the Main phase; the other waits for them.
  const mains = await Promise.all([alice, bob].map((p) => p.getByRole("button", { name: /Assign Banners →/ }).count()));
  expect([...mains].sort()).toEqual([0, 1]);
  const waiting = mains[0] ? bob : alice;
  await expect(waiting.getByText(/Waiting for/)).toBeVisible();
  // Both see 2 Holdings per player.
  await expect(alice.locator(".site .holding")).toHaveCount(4);
  await expect(bob.locator(".site .holding")).toHaveCount(4);
});

test("a rival's counters wait for the server to confirm your move", async ({ browser }) => {
  const pages = await startMatch(browser);
  await playSetup(pages);
  const first = (await pages[0].getByRole("button", { name: /Assign Banners →/ }).count()) ? 0 : 1;
  const [mover, rival] = [pages[first]!, pages[1 - first]!];

  // Round one: nobody harvests on their first turn.
  await confirmBanners(mover);
  await mover.getByRole("button", { name: /End Turn/ }).click();
  await confirmBanners(rival);
  await rival.getByRole("button", { name: /End Turn/ }).click();
  await confirmBanners(mover);

  // Ending this turn starts the rival's, with a harvest from their Banners.
  await expect(mover.getByRole("note", { name: /next Harvest: \d/ })).toBeVisible();
  const counters = mover.locator("article.player:has(.next) > div.res");
  const before = await counters.textContent();
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await mover.route("**/api/matches/*/commands", async (route) => {
    await held;
    await route.continue();
  });
  await mover.getByRole("button", { name: /End Turn/ }).click();

  // The move is still on its way: the rival's counters stay as they were.
  await mover.waitForTimeout(1500);
  await expect(counters).toHaveText(before ?? "");

  release();
  await expect(counters).not.toHaveText(before ?? "");
});
