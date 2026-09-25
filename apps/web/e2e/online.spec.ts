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

/**
 * Into Banner Assignment. Its End Turn confirms the Banners and ends the turn
 * in one batch (#11); assign_banners is undo-safe, so nothing reaches the
 * server before that click.
 */
async function toBannerPhase(page: Page) {
  await page.getByRole("button", { name: /Assign Banners →/ }).click({ timeout: 20_000 });
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

test("a stale saved session is replaced by a new guest session", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false }));
    // A token the server does not know, e.g. after its database was reset.
    localStorage.setItem("mm.online.v1", JSON.stringify({ serverUrl: "http://localhost:8788", token: "stale-token", userId: "u_gone", displayName: "Carol" }));
  });
  await page.reload();
  await page.getByRole("button", { name: "Play online" }).click();
  await expect(page.locator(".notice")).toContainText("new guest");
  await expect(page.getByRole("button", { name: /Create/ })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("mm.online.v1") ?? "{}") as { token?: string });
  expect(saved.token).toBeTruthy();
  expect(saved.token).not.toBe("stale-token");
});

test("a failed session renewal does not leave the renewal notice behind", async ({ page }) => {
  // The server forgets every session it hands out, then stops issuing new ones.
  await page.route("http://localhost:8788/api/matches", (route) => route.fulfill({ status: 401, json: { error: "unknown session", code: "INVALID_SESSION" } }));
  let guests = 0;
  await page.route("http://localhost:8788/api/guest", (route) =>
    ++guests === 1
      ? route.fulfill({ json: { token: "short-lived", userId: "u_short", displayName: "Carol" } })
      : route.fulfill({ status: 500, json: { error: "internal error" } }),
  );
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false }));
    localStorage.setItem("mm.online.v1", JSON.stringify({ serverUrl: "http://localhost:8788", token: "stale-token", userId: "u_gone", displayName: "Carol" }));
  });
  await page.reload();
  await page.getByRole("button", { name: "Play online" }).click();
  // The first renewal succeeds, so the notice is accurate while the lobby stays open.
  await expect(page.locator(".notice")).toContainText("new guest");
  // The refresh button is a "↻" glyph, or an icon labelled "Refresh" once the lobby uses icons.
  await page.getByRole("button", { name: /^(↻|Refresh)$/ }).click();
  // The second renewal fails: back to the sign-in form, without claiming a new session.
  await expect(page.getByRole("button", { name: "Continue as guest" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("internal error");
  await expect(page.locator(".notice")).toHaveCount(0);
});

test("a rival's counters wait for the server to confirm your move", async ({ browser }) => {
  const pages = await startMatch(browser);
  await playSetup(pages);
  const first = (await pages[0].getByRole("button", { name: /Assign Banners →/ }).count()) ? 0 : 1;
  const [mover, rival] = [pages[first]!, pages[1 - first]!];

  // Round one: nobody harvests on their first turn.
  await toBannerPhase(mover);
  await mover.getByRole("button", { name: /End Turn/ }).click();
  await toBannerPhase(rival);
  await rival.getByRole("button", { name: /End Turn/ }).click();
  await toBannerPhase(mover);

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
