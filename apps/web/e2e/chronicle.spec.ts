import { expect, test, type Page } from "@playwright/test";

// Chronicle auto-scroll stickiness: the log follows new entries only while it
// is pinned to the bottom; reading history must survive new entries arriving.

async function startVsAi(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, rivalChatter: false }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("e2e-log");
  await page.getByRole("button", { name: "Begin" }).click();
}

async function status(page: Page): Promise<string> {
  const el = page.locator(".actions .status").first();
  return (await el.count()) ? ((await el.textContent()) ?? "") : "";
}

async function assignAllBanners(page: Page) {
  const n = await page.locator(".banner.hl").count();
  for (let i = 0; i < n; i++) {
    await page.locator(".banner.hl").nth(i).click();
    const regions = page.locator(".region.hl");
    if (await regions.count()) await regions.first().click();
  }
  await page.getByRole("button", { name: /Confirm Banners/ }).click();
}

async function completeSetup(page: Page) {
  for (let k = 0; k < 60; k++) {
    const s = await status(page);
    if (/place a Manor/.test(s)) await page.locator(".site.hl").first().click();
    else if (/free Route/.test(s)) await page.locator(".route.hl").first().click();
    else if (/starting Banners/.test(s)) await assignAllBanners(page);
    else if (/thinking|waiting/i.test(s)) await page.waitForTimeout(250);
    else break;
  }
}

async function endFullTurn(page: Page) {
  await page.getByRole("button", { name: /Assign Banners →/ }).click();
  // The Banner phase's End Turn confirms the Banners and ends the turn.
  await page.getByRole("button", { name: /End Turn/ }).click();
  await expect(page.getByRole("button", { name: /^Build Route/ })).toBeVisible({ timeout: 30_000 });
}

test("the Chronicle keeps the reader's scroll position and offers a jump pill", async ({ page }) => {
  await startVsAi(page);
  await completeSetup(page);

  // End turns until the Chronicle overflows its 22rem max-height enough that
  // scrolling up really leaves the bottom (threshold + margin).
  const list0 = page.locator(".log ol");
  for (let i = 0; i < 5; i++) {
    await endFullTurn(page);
    await page.getByRole("tab", { name: "Chronicle" }).click();
    if ((await list0.evaluate((el) => el.scrollHeight - el.clientHeight)) > 80) break;
    await page.getByRole("tab", { name: "Players" }).click();
  }
  await page.getByRole("tab", { name: "Chronicle" }).click();
  const list = page.locator(".log ol");
  const gap = () => list.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
  const pill = page.locator(".log .jump");
  await expect(list.locator("li").last()).toContainText(/harvest|turn/i);

  // Opening the tab mounts the list at the latest entry, without the pill.
  await page.getByRole("tab", { name: "Players" }).click();
  await page.getByRole("tab", { name: "Chronicle" }).click();
  await expect.poll(gap).toBeLessThan(40);
  await expect(pill).toBeHidden();

  // Scroll up to read history. The list must overflow for this to mean anything.
  await list.evaluate((el) => (el.scrollTop = 0));
  await expect(pill).toBeVisible();
  expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight + 40)).toBe(true);

  // A new entry arrives while the reader is scrolled up (a build of their own).
  await page.getByRole("button", { name: "Debug" }).click();
  await page.getByRole("button", { name: "Grant 5 of each resource" }).click();
  await page.getByRole("dialog", { name: "Debug tools" }).getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: /^Build Route/ }).click();
  await page.locator(".route.hl").first().click();
  await expect(page.locator(".log ol li").last()).toContainText(/built a Route/);
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(0);
  await expect(pill).toBeVisible();

  // The pill jumps back to the latest entry.
  await pill.click();
  await expect.poll(() => list.evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThan(40);
  await expect(pill).toBeHidden();

  // Pinned again: a whole round of new entries keeps the list at the bottom.
  const before = await list.locator("li").count();
  await endFullTurn(page);
  await expect.poll(() => list.locator("li").count()).toBeGreaterThan(before);
  await expect.poll(gap).toBeLessThan(40);
  await expect(pill).toBeHidden();

  // A background tab pauses animation frames while AI turns keep appending
  // on timers: the list must still follow (no frame-deferred scroll).
  await page.evaluate(() => {
    const held: FrameRequestCallback[] = [];
    Object.assign(window, { heldFrames: held });
    window.requestAnimationFrame = (cb) => held.push(cb);
  });
  await endFullTurn(page);
  await expect.poll(gap).toBeLessThan(40);
  await expect(pill).toBeHidden();
});
