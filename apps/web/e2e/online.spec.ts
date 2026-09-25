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

  for (let i = 0; i < 12; i++) {
    for (const p of [alice, bob]) {
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
