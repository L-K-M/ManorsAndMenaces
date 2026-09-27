import { expect, test } from "@playwright/test";

// Sealed Charges (spec §27A) in a hot-seat game: the option on New Game,
// each player keeping one of two Charges behind the privacy curtain, the
// sealed mark on the scoreboard, your own Charge and the deck's count in
// the Quests tab, and every seat's draw in the Chronicle.

test("Sealed Charges are chosen behind the curtain and shown only to their holder", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("e2e-sealed");
  await page.getByLabel(/Sealed Charges/).check();
  await page.getByRole("button", { name: "Begin" }).click();

  const choose = page.getByRole("dialog", { name: "Choose a Sealed Charge" });
  const kept: string[] = [];
  for (let seat = 0; seat < 2; seat++) {
    // Nobody sees the Charges drawn until their player has taken the device.
    await expect(choose).toHaveCount(0);
    await page.getByRole("button", { name: "Tap to begin turn" }).click();
    const keep = choose.getByRole("button", { name: /^Keep / });
    await expect(keep).toHaveCount(2);
    kept.push(((await keep.first().textContent()) ?? "").replace(/^Keep /, "").trim());
    await keep.first().click();
  }
  expect(kept[0]).not.toBe(kept[1]);

  // Setup goes on with the first placement; both players hold a sealed Charge.
  await page.getByRole("button", { name: "Tap to begin turn" }).click();
  await expect(page.locator(".actions .status").first()).toContainText(/place a Manor/);
  await expect(page.locator(".scoreboard .sealed")).toHaveCount(2);

  // The Quests tab shows the first player's own Charge and its progress, and never the other's.
  await page.getByRole("tab", { name: /Quests/ }).click();
  const panel = page.getByRole("region", { name: "Your Sealed Charge" });
  await expect(panel.getByRole("progressbar")).toBeVisible();
  await expect(panel).toContainText(kept[0] as string);
  await expect(panel).not.toContainText(kept[1] as string);
  // A Standard deck for 2 players holds 14 Charges; each seat kept one of two and put the other back.
  await expect(panel).toContainText("Charges left in the deck: 12");

  // Every seat's draw is in the Chronicle, the first seat's too, which the new game drew.
  await page.getByRole("tab", { name: "Chronicle", exact: true }).click();
  await expect(page.locator(".side").getByText(/drew 2 Sealed Charges to choose from/)).toHaveCount(2);
});
