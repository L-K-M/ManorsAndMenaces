import { expect, test } from "@playwright/test";
import { rulesContentFor } from "@manors-menaces/content";
import { SAVE_SCHEMA_VERSION, type SaveFile } from "@manors-menaces/protocol";
import { RULESET_VERSION, createRulesEngine, standardRuleset } from "@manors-menaces/rules";

// Sealed Charges (spec §27A) in a hot-seat game: the option on New Game,
// each player keeping one of two Charges behind the privacy curtain, the
// sealed mark on the scoreboard, your own Charge and the deck's count in
// the Quests tab, and every seat's draw in the Chronicle.

for (const artMode of ["painted", "high contrast", "failed images"] as const) {
  test(`Sealed Charges are illustrated in ${artMode}, chosen behind the curtain and shown only to their holder`, async ({ page }) => {
    if (artMode === "failed images") await page.route(/\/art\/(landmarks|menaces|quests|cards)\//, (route) => route.abort());
    await page.goto("/");
    await page.evaluate((highContrast) => {
      localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true, highContrast }));
      indexedDB.deleteDatabase("manors-menaces");
    }, artMode === "high contrast");
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
      await expect(page.locator("[data-charge-art]")).toHaveCount(0);
      await page.getByRole("button", { name: "Tap to begin turn" }).click();
      const keep = choose.getByRole("button", { name: /^Keep / });
      await expect(keep).toHaveCount(2);
      if (artMode === "painted") {
        await expect(choose.locator("[data-charge-art] img")).toHaveCount(2);
        for (const img of await choose.locator("[data-charge-art] img").all()) {
          await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        }
      } else {
        await expect(choose.locator("[data-charge-art] svg")).toHaveCount(2);
        await expect(choose.locator("[data-charge-art] img")).toHaveCount(0);
      }
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await choose.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.setViewportSize({ width: 1400, height: 900 });
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
    await expect(panel.locator(`[data-charge-art] ${artMode === "painted" ? "img" : "svg"}`)).toBeVisible();
    await expect(panel).toContainText(kept[0] as string);
    await expect(panel).not.toContainText(kept[1] as string);
    // A Standard deck for 2 players holds 14 Charges; each seat kept one of two and put the other back.
    await expect(panel).toContainText("Charges left in the deck: 12");

    // Every seat's draw is in the Chronicle, the first seat's too, which the new game drew.
    await page.getByRole("tab", { name: "Chronicle", exact: true }).click();
    await expect(page.locator(".side").getByText(/drew 2 Sealed Charges to choose from/)).toHaveCount(2);
  });
}

/** A two-player game in round 5 in which Wat has revealed Seat at Court, saved without a history. */
function revealedSave(): SaveFile {
  const engine = createRulesEngine(rulesContentFor("greenvale"));
  const seats = ["Ysolde", "Wat"].map((displayName, i) => ({ playerId: `P${i + 1}`, displayName, kind: "human" as const, color: i }));
  const state = engine.createGame({
    matchId: "local-e2e-revealed",
    seed: "e2e-revealed",
    rulesetVersion: RULESET_VERSION,
    ruleset: standardRuleset(2, { sealedCharges: true }),
    players: seats.map((s) => ({ id: s.playerId, displayName: s.displayName })),
  });
  state.status = "playing";
  state.phase = "main";
  state.round = 5;
  state.activePlayerId = "P1";
  delete state.setup;
  delete state.pending;
  const wat = state.players.P2;
  if (!wat) throw new Error("no second player");
  wat.revealedChargeIds = ["seat_at_court"];
  if (state.chargeDeck) state.chargeDeck = state.chargeDeck.filter((id) => id !== "seat_at_court");
  return { schemaVersion: SAVE_SCHEMA_VERSION, rulesetVersion: RULESET_VERSION, savedAt: new Date(0).toISOString(), mapId: "greenvale", seats, initialState: structuredClone(state), state, commandHistory: [] };
}

// A tooltip alone kept what a revealed Charge asked from touch screens.
test("a revealed Charge says what it asked in the Quests tab", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: false })));
  await page.reload();
  await page.getByRole("button", { name: "Load game", exact: true }).click();
  await page.getByLabel(/Import a save file/).setInputFiles({ name: "revealed.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(revealedSave())) });
  await page.getByRole("tab", { name: /Quests/ }).click();
  const revealed = page.locator(".charges .done li");
  await expect(revealed).toHaveCount(1);
  await expect(revealed).toContainText("Seat at Court (Wat)");
  await expect(revealed.getByText("Your network reaches the Royal Castle, and one of your Banners is in a Region touching it.")).toBeVisible();
});
