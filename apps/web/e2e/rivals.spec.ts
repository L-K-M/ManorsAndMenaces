import { expect, test } from "@playwright/test";
import { pick } from "./pick";

// Named AI rivals: New Game seats distinct rivals with portraits, and a
// rival introduces itself with a quip when it builds its first Manor.

test("computer seats are distinct named rivals who quip when they build", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "3", exact: true }).check({ force: true });

  // Two AI seats, two different rivals, each named after its rival.
  const rival2 = await page.getByLabel("Player 2 rival").inputValue();
  const rival3 = await page.getByLabel("Player 3 rival").inputValue();
  expect(rival2).not.toBe(rival3);
  const name2 = await page.getByLabel("Name of player 2").inputValue();
  const name3 = await page.getByLabel("Name of player 3").inputValue();
  expect(name2).not.toBe(name3);
  expect(await page.getByLabel("Player 2 rival").locator("option:checked").textContent()).toContain(name2);

  // A rival already seated cannot be picked twice.
  await expect(page.getByLabel("Player 2 rival").locator(`option[value="${rival3}"]`)).toBeDisabled();

  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("rivals-e2e");
  await page.getByRole("button", { name: "Begin" }).click();

  // The player cards show both rivals with their own portraits.
  const cards = page.locator(".players .player");
  await expect(cards).toHaveCount(3);
  const portraits = page.locator(".players .player .portrait");
  await expect(portraits).toHaveCount(2);
  const labels = await portraits.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(labels[0]).not.toBe(labels[1]);
  for (const name of [name2, name3]) {
    await expect(cards.filter({ hasText: name }).locator(".portrait")).toBeVisible();
  }

  // Play the human's placements until a rival has built and said something.
  const bubble = page.locator(".players .player .quip");
  for (let k = 0; k < 8 && !(await bubble.count()); k++) {
    const status = (await page.locator(".actions .status").first().textContent()) ?? "";
    if (/place a Manor/.test(status)) await page.locator(".site.hl").first().click();
    else if (/free Route/.test(status)) await pick(page.locator(".route.hl").first());
    await page.waitForTimeout(400);
  }
  await expect(bubble.first()).toBeVisible();
  const speaker = (await bubble.first().locator("xpath=ancestor::article").locator("strong").textContent()) ?? "";
  expect([name2, name3]).toContain(speaker);
  const line = ((await bubble.first().textContent()) ?? "").trim();
  expect(line.length).toBeGreaterThan(3);

  // The same line is recorded in the Chronicle.
  await page.getByRole("tab", { name: "Chronicle" }).click();
  await expect(page.locator(".log li.quip").first()).toContainText(`${speaker}: “${line}”`);
  expect(errors).toEqual([]);
});

test("rivals on seats left out of the game stay free to pick", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "4", exact: true }).check({ force: true });
  const heldBy3 = await page.getByLabel("Player 3 rival").inputValue();

  // Seats 3 and 4 are not playing, so their rivals must not be greyed out.
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  const picker = page.getByLabel("Player 2 rival");
  await expect(picker.locator("option:disabled")).toHaveCount(0);

  // Take seat 3's rival, then bring seat 3 back: it gets another rival
  // rather than a duplicate.
  await picker.selectOption(heldBy3);
  await page.getByRole("radio", { name: "4", exact: true }).check({ force: true });
  const ids = await Promise.all([2, 3, 4].map((n) => page.getByLabel(`Player ${n} rival`).inputValue()));
  expect(ids[0]).toBe(heldBy3);
  expect(new Set(ids).size).toBe(3);
});

test("a quip said just before the privacy curtain waits for the reveal", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "3", exact: true }).check({ force: true });
  await page.getByLabel("Player 3 type").selectOption("human");
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("rivals-curtain");
  await page.getByRole("button", { name: "Begin" }).click();

  // Player 1 places; the rival (player 2) introduces itself with its first
  // Manor, then the curtain goes up for player 3.
  const curtain = page.getByRole("dialog", { name: /^Pass to / });
  // A hot-seat game opens behind the curtain for its first human (#9).
  await curtain.getByRole("button", { name: "Tap to begin turn" }).click();
  for (let k = 0; k < 8 && !(await curtain.count()); k++) {
    const status = (await page.locator(".actions .status").first().textContent()) ?? "";
    if (/place a Manor/.test(status)) await page.locator(".site.hl").first().click();
    else if (/free Route/.test(status)) await pick(page.locator(".route.hl").first());
    await page.waitForTimeout(400);
  }
  await expect(curtain).toBeVisible();

  // Wait longer than a bubble stays up: nobody could read it behind the
  // curtain, so it must still be there once player 3 looks.
  await page.waitForTimeout(6500);
  await curtain.getByRole("button", { name: "Tap to begin turn" }).click();
  await expect(page.locator(".players .player .quip")).toHaveCount(1);
});
