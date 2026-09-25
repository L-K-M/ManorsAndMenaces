import { expect, test, type Browser, type BrowserContext, type Page, type WebSocketRoute } from "@playwright/test";

// Online play (spec §58–60, §86): two browsers, invite code, synchronized setup.

async function player(browser: Browser, name: string, prepare?: (ctx: BrowserContext) => Promise<void>): Promise<Page> {
  const ctx = await browser.newContext();
  await prepare?.(ctx);
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

async function startMatch(browser: Browser, prepareAlice?: (ctx: BrowserContext) => Promise<void>): Promise<[Page, Page]> {
  const alice = await player(browser, "Alice", prepareAlice);
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

/** Opens the Chronicle tab and returns the log. */
async function chronicle(page: Page) {
  await page.getByRole("tab", { name: "Chronicle" }).click();
  return page.getByRole("region", { name: "Game log" });
}

/** Ends turns until it is `who`'s turn, then returns once they can act. */
async function untilTurnOf(who: Page, other: Page) {
  // Wait a moment rather than count once: right after setup the button may not have rendered yet.
  const othersTurn = await other
    .getByRole("button", { name: /Assign Banners →/ })
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(
      () => true,
      () => false,
    );
  if (othersTurn) {
    await toBannerPhase(other);
    await other.getByRole("button", { name: /End Turn/ }).click();
  }
  await expect(who.getByRole("button", { name: /Assign Banners →/ })).toBeVisible({ timeout: 20_000 });
}

test("reloading returns to the online match with its Chronicle", async ({ browser }) => {
  const [alice, bob] = await startMatch(browser);
  await playSetup([alice, bob]);
  await untilTurnOf(bob, alice);
  await expect(await chronicle(alice)).toContainText("Bob's turn");
  const lines = await (await chronicle(alice)).locator("li").allTextContents();
  expect(alice.url()).toMatch(/#\/match\//);

  await alice.reload();
  await expect(alice.locator(".board")).toBeVisible();
  const log = await chronicle(alice);
  await expect(log.locator("li")).toHaveText(lines);
  // Nothing happened while the page reloaded.
  await expect(log.locator("li.divider")).toHaveCount(0);
  // Leaving the match drops it from the address, so a reload opens the title screen.
  await alice.getByRole("button", { name: "Main menu" }).click();
  await alice.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Exit to title" }).click();
  await alice.getByRole("dialog", { name: "Leave this game?" }).getByRole("button", { name: "Exit to title" }).click();
  await expect(alice).not.toHaveURL(/#\/match\//);
  await alice.reload();
  await expect(alice.getByRole("button", { name: "Play online" })).toBeVisible();
});

test("a returning player finds the moves made while they were away", async ({ browser }) => {
  const [alice, bob] = await startMatch(browser);
  await playSetup([alice, bob]);
  await untilTurnOf(bob, alice);
  const link = alice.url();
  const context = alice.context();
  await alice.close();

  await toBannerPhase(bob);
  await bob.getByRole("button", { name: /End Turn/ }).click();

  const back = await context.newPage();
  await back.goto(link);
  await expect(back.locator(".board")).toBeVisible();
  // The Chronicle is already open at the divider.
  await expect(back.getByRole("tab", { name: "Chronicle" })).toHaveAttribute("aria-selected", "true");
  await expect(back.locator(".log li.divider")).toBeInViewport();
  const log = await chronicle(back);
  await expect(log.locator("li.divider")).toHaveText("Since your last visit");
  await expect(log.locator("li.divider ~ li", { hasText: "Alice's turn" })).toHaveCount(1);
  await expect(back.getByRole("button", { name: /Assign Banners →/ })).toBeVisible();
});

test("a dropped connection catches up on the moves it missed", async ({ browser }) => {
  let socket: WebSocketRoute | null = null;
  let offline = false;
  const [alice, bob] = await startMatch(browser, (ctx) =>
    ctx.routeWebSocket(/\/api\/ws/, (ws) => {
      if (offline) return void ws.close();
      socket = ws;
      ws.connectToServer();
    }),
  );
  await playSetup([alice, bob]);
  await untilTurnOf(bob, alice);
  const log = await chronicle(alice);
  const turnLines = () => log.locator("li", { hasText: "Alice's turn" }).count();
  const before = await turnLines();

  offline = true;
  await (socket as WebSocketRoute | null)?.close();
  await toBannerPhase(bob);
  await bob.getByRole("button", { name: /End Turn/ }).click();
  await expect(bob.getByText(/Waiting for/)).toBeVisible();
  offline = false;

  // Back online, Alice's Chronicle gets Bob's end of turn, not only the new board.
  await expect(alice.getByRole("button", { name: /Assign Banners →/ })).toBeVisible({ timeout: 20_000 });
  await expect.poll(turnLines).toBe(before + 1);
});

test("a match link that is not yours opens the lobby and is dropped", async ({ browser }) => {
  const page = await player(browser, "Dave");
  await expect(page.getByRole("button", { name: /Create/ })).toBeVisible();
  await page.goto("/#/match/m_missing");
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("no such match");
  await expect(page).not.toHaveURL(/#\/match\//);
  await expect(page.getByRole("button", { name: /Create/ })).toBeVisible();
});

test("a player who left the match hears it is their turn and opens it from the notice", async ({ browser }) => {
  const [alice, bob] = await startMatch(browser);
  await playSetup([alice, bob]);
  await untilTurnOf(bob, alice);
  await alice.getByRole("button", { name: "Main menu" }).click();
  await alice.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Exit to title" }).click();
  await alice.getByRole("dialog", { name: "Leave this game?" }).getByRole("button", { name: "Exit to title" }).click();
  await expect(alice.getByRole("button", { name: "Play online" })).toBeVisible();
  // Screen readers reliably read a live region only if it was there before the news.
  const spoken = alice.getByRole("log", { name: "Match notices" });
  await expect(spoken).toBeAttached();

  await toBannerPhase(bob);
  await bob.getByRole("button", { name: /End Turn/ }).click();

  const notices = alice.getByRole("region", { name: "Match notices" });
  await expect(notices).toContainText("Your turn");
  await expect(notices).toContainText("Your move in the match with Bob.");
  await expect(spoken.locator("p").last()).toHaveText("Your turn. Your move in the match with Bob.");
  await notices.getByRole("button", { name: "Open" }).click();
  await expect(alice.locator(".board")).toBeVisible();
  await expect(alice.getByRole("button", { name: /Assign Banners →/ })).toBeVisible();
  await expect(notices).toHaveCount(0);

  // Bob has the match open: its turn needs no notice.
  await toBannerPhase(alice);
  await alice.getByRole("button", { name: /End Turn/ }).click();
  await expect(bob.getByRole("button", { name: /Assign Banners →/ })).toBeVisible({ timeout: 20_000 });
  await expect(bob.getByRole("region", { name: "Match notices" })).toHaveCount(0);
});

test("a notice goes away once its match is opened from the lobby", async ({ browser }) => {
  const [alice, bob] = await startMatch(browser);
  await playSetup([alice, bob]);
  await untilTurnOf(bob, alice);
  await alice.getByRole("button", { name: "Main menu" }).click();
  await alice.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Exit to title" }).click();
  await alice.getByRole("dialog", { name: "Leave this game?" }).getByRole("button", { name: "Exit to title" }).click();

  await toBannerPhase(bob);
  await bob.getByRole("button", { name: /End Turn/ }).click();
  const notices = alice.getByRole("region", { name: "Match notices" });
  await expect(notices).toContainText("Your turn");

  await alice.getByRole("button", { name: "Play online" }).click();
  await alice.getByRole("button", { name: /Alice · Bob/ }).click();
  await expect(alice.getByRole("button", { name: /Assign Banners →/ })).toBeVisible();
  await expect(notices).toHaveCount(0);
});
