import { expect, test } from "@playwright/test";

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
    else if (/free Route/.test(status)) await page.locator(".route.hl").first().click();
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
