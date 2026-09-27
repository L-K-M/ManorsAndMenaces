import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { runAiUntilHuman } from "@manors-menaces/ai";
import { rulesContentFor } from "@manors-menaces/content";
import { SAVE_SCHEMA_VERSION, type SaveFile } from "@manors-menaces/protocol";
import { BALANCE, RULESET_VERSION, createRng, createRulesEngine, crownsVoiceRules, getLegalActions, mvpRuleset, seedRng, standardRuleset, type RulesetConfig } from "@manors-menaces/rules";
import { TUTORIAL_SEED } from "../src/lib/game/saves.js";
import { pick } from "./pick";
import { topBarRowOffsets } from "./topbar";

// Critical flows (spec §66.5): create game, initial placement, first turn,
// build route, assign banner, harvest, buy card, move menace, save/reload, win.

async function startHotseat(page: Page, rules: "standard" | "mvp" = "standard") {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true, bannerWarning: false }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await beginHotseat(page, rules);
}

/** From the title screen, keeping stored saves: always the same seed. */
async function beginHotseat(page: Page, rules: "standard" | "mvp" = "standard") {
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 2 type").selectOption("human");
  if (rules === "mvp") await page.getByRole("radio", { name: /Core/ }).check();
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("e2e-seed");
  await page.getByRole("button", { name: "Begin" }).click();
}

/**
 * A finished hot-seat game with its full history, played by the AI (three
 * players by default, to 15 Renown, which someone reaches: at a goal of 30
 * this seed's board fills up first, and that ends the game).
 */
function finishedSave(seed = "e2e-finished", names = ["Ysolde", "Wat", "Maud"], ruleset: RulesetConfig = standardRuleset(3, { targetRenown: 15 })): SaveFile {
  const engine = createRulesEngine(rulesContentFor("greenvale"));
  const seats = names.map((displayName, i) => ({ playerId: `P${i + 1}`, displayName, kind: "human" as const, color: i }));
  const initialState = engine.createGame({
    matchId: `local-${seed}`,
    seed,
    rulesetVersion: RULESET_VERSION,
    ruleset,
    players: seats.map((s) => ({ id: s.playerId, displayName: s.displayName })),
  });
  const rng = createRng(seedRng(`${seed}-ai`));
  const { state, commands } = runAiUntilHuman(engine, initialState, () => true, () => ({ level: "normal", rng }), 20_000);
  expect(state.status, "the AI must finish the game within its 20,000-command budget").toBe("finished");
  return { schemaVersion: SAVE_SCHEMA_VERSION, rulesetVersion: RULESET_VERSION, savedAt: new Date(0).toISOString(), mapId: "greenvale", seats, initialState, state, commandHistory: commands };
}

async function passCurtain(page: Page) {
  const curtain = page.getByRole("button", { name: "Tap to begin turn" });
  await curtain.click({ timeout: 1500 }).catch(() => undefined);
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
    if (await regions.count()) await pick(regions.first());
  }
  await page.getByRole("button", { name: /Confirm Banners/ }).click();
}

async function completeSetup(page: Page) {
  for (let k = 0; k < 12; k++) {
    await passCurtain(page);
    const s = await status(page);
    if (/place a Manor/.test(s)) await pick(page.locator(".site.hl").first());
    else if (/free Route/.test(s)) await pick(page.locator(".route.hl").first());
    else if (/starting Banners/.test(s)) await assignAllBanners(page);
    else break;
  }
  await passCurtain(page);
  await expect(page.getByRole("button", { name: /Assign Banners →/ })).toBeVisible();
}

async function endTurn(page: Page) {
  await page.getByRole("button", { name: /Assign Banners →/ }).click();
  await page.getByRole("button", { name: /End Turn/ }).click();
}

async function debugGrant(page: Page) {
  await page.getByRole("button", { name: "Debug" }).click();
  await page.getByRole("button", { name: "Grant 5 of each resource" }).click();
  await page.getByRole("dialog", { name: "Debug tools" }).getByRole("button", { name: "Close" }).click();
}

test("setup, first turn, build, harvest, warden, save and reload, victory", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await startHotseat(page);
  await completeSetup(page);

  // Build a Route with debug-granted resources.
  await debugGrant(page);
  await page.getByRole("button", { name: /^Build Route/ }).click();
  const routesBefore = await page.locator(".route.hl").count();
  expect(routesBefore).toBeGreaterThan(0);
  await pick(page.locator(".route.hl").first());
  await page.getByRole("tab", { name: "Chronicle" }).click();
  await expect(page.getByText(/built a Route/)).toBeVisible();

  // Undo is available for undo-safe actions.
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  // Buy a card.
  await page.getByRole("button", { name: /^Buy Card/ }).click();
  await expect(page.getByText(/bought a card/)).toBeVisible();

  // Hire a Warden to move a Menace.
  await page.getByRole("button", { name: /^Hire a Warden/ }).click();
  await page.locator(".menace.hl").first().click();
  await pick(page.locator(".region.hl, .route.hl, .site.hl").first());
  await expect(page.getByText(/hired a Warden/)).toBeVisible();

  await endTurn(page);
  // Second player's first turn.
  await passCurtain(page);
  await endTurn(page);
  // First player's second turn: Harvest happens.
  await passCurtain(page);
  await expect(page.getByText(/harvested/).first()).toBeVisible();

  // Save, reload, continue.
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Saved." })).toBeVisible();
  const roundText = await page.locator(".round").textContent();
  await page.reload();
  await page.getByRole("button", { name: "Continue" }).click();
  await passCurtain(page);
  await expect(page.locator(".round")).toHaveText(roundText ?? "");
  // The Chronicle is rebuilt from the saved history. Debug commands are not
  // recorded, so the replay stops at the first debug-funded build and says so.
  await page.getByRole("tab", { name: "Chronicle" }).click();
  await expect(page.locator(".log li").filter({ hasText: "Alice assigned" }).first()).toBeVisible();
  await expect(page.locator(".log li").last()).toHaveText(/could not be restored/);

  // Win via debug Renown.
  await page.getByRole("button", { name: "Debug" }).click();
  const dialog = page.getByRole("dialog", { name: "Debug tools" });
  await dialog.getByLabel("Bonus Renown").fill(String(standardRuleset(2).targetRenown));
  await dialog.getByRole("button", { name: "Set bonus Renown" }).click();
  await dialog.getByRole("button", { name: "Close" }).click();
  await endTurn(page);
  const victory = page.getByRole("dialog", { name: "Victory!" });
  await expect(victory).toBeVisible();
  await expect(victory.getByRole("heading", { name: "Final standings" })).toBeVisible();

  // The results close to show the final board and reopen from the Game over button.
  await page.keyboard.press("Escape");
  await expect(victory).toBeHidden();
  await page.getByRole("button", { name: /Game over/ }).click();
  await expect(victory).toBeVisible();

  // A finished game drops its autosave: Continue never reopens a Victory.
  // (Play again from a loaded game is covered by the finished-save test below.)
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "New game" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Continue/ })).toHaveCount(0);
  }).toPass();
  expect(errors).toEqual([]);
});

test("a finished saved game opens on the full results", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false })));
  await page.reload();
  await page.getByRole("button", { name: "Load game" }).click();
  await page.getByLabel(/Import a save file/).setInputFiles({ name: "finished.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(finishedSave())) });

  const victory = page.getByRole("dialog", { name: "Victory!" });
  await expect(victory).toBeVisible();
  await expect(victory.locator(".standings li")).toHaveCount(3);
  await expect(victory.locator("svg.renown-chart polyline")).toHaveCount(3);
  expect(await victory.locator(".award").count()).toBeGreaterThanOrEqual(2);
  expect(await victory.locator(".recap li").count()).toBeGreaterThanOrEqual(3);

  await victory.getByRole("button", { name: "View board" }).click();
  await expect(victory).toBeHidden();
  await page.getByRole("button", { name: /Game over/ }).click();
  await victory.getByRole("button", { name: "Play again" }).click();
  await passCurtain(page);
  await expect(page.locator(".round")).toHaveText("Round 1 of 30");
  await page.getByRole("tab", { name: "Players" }).click();
  for (const name of ["Ysolde", "Wat", "Maud"]) await expect(page.locator(".players")).toContainText(name);
  expect(errors).toEqual([]);
});

test("a game that ends on a full board says so on the results", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false })));
  await page.reload();
  await page.getByRole("button", { name: "Load game" }).click();
  // A seed whose board fills before the round's last turn, so the Chronicle also announces it.
  const save = finishedSave("e2e-full-2", undefined, standardRuleset(3, { targetRenown: 30 }));
  await page.getByLabel(/Import a save file/).setInputFiles({ name: "full-board.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(save)) });

  const victory = page.getByRole("dialog", { name: "Victory!" });
  await expect(victory).toContainText("had the most Renown when the board filled");
  await expect(victory).toContainText("The board was full: no Site was left to build on and every Holding was a Stronghold");
  await expect(victory.locator(".recap li").last()).toContainText("with the board full");
  await victory.getByRole("button", { name: "View board" }).click();
  await page.getByRole("tab", { name: /Chronicle/ }).click();
  await expect(page.getByText("If it is still full when this round ends, the game ends.").first()).toBeVisible();
});

/**
 * A three-player game in play in `round`, for the round chip: a fresh game
 * moved on to that round, saved without a history (as quest-art.spec.ts does).
 * From round 16 the Crown's Levy is in force, as in any Standard game by
 * then (§27.3); `voice` adds the Crown's Voice, speaking by then too.
 */
function saveInRound(round: number, { voice = false } = {}): SaveFile {
  const engine = createRulesEngine(rulesContentFor("greenvale"));
  const seats = ["Ysolde", "Wat", "Maud"].map((displayName, i) => ({ playerId: `P${i + 1}`, displayName, kind: "human" as const, color: i }));
  const state = engine.createGame({
    matchId: "local-e2e-reign",
    seed: "e2e-reign",
    rulesetVersion: RULESET_VERSION,
    ruleset: voice ? { ...standardRuleset(3), crownsVoice: crownsVoiceRules() } : standardRuleset(3),
    players: seats.map((s) => ({ id: s.playerId, displayName: s.displayName })),
  });
  state.status = "playing";
  state.phase = "main";
  state.round = round;
  state.activePlayerId = "P1";
  delete state.setup;
  if (round >= 16) {
    state.questDeck = [];
    state.crownLevy = { current: "grain", next: "stone", called: ["timber", "grain", "stone"], answeredBy: [] };
    if (state.crownsVoice) state.crownsVoice.speaking = true;
  }
  return { schemaVersion: SAVE_SCHEMA_VERSION, rulesetVersion: RULESET_VERSION, savedAt: new Date(0).toISOString(), mapId: "greenvale", seats, initialState: structuredClone(state), state, commandHistory: [] };
}

test("a game that ends on the last round says so, and the round chip counts toward it", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: false })));
  await page.reload();

  // Nobody gets near 30 Renown in 8 rounds, so the last round ends the game.
  await page.getByRole("button", { name: "Load game" }).click();
  const save = finishedSave(undefined, undefined, { ...standardRuleset(3, { targetRenown: 30 }), lastRound: 8 });
  await page.getByLabel(/Import a save file/).setInputFiles({ name: "last-round.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(save)) });
  const victory = page.getByRole("dialog", { name: "Victory!" });
  await expect(victory).toContainText("had the most Renown when the reign ended");
  await expect(victory).toContainText("The reign ended with round 8, the last round");
  await expect(victory.locator(".recap li").last()).toContainText("the last of the reign");
  await victory.getByRole("button", { name: "View board" }).click();
  await expect(page.locator(".round")).toHaveText("Last round");
  await page.getByRole("tab", { name: /Chronicle/ }).click();
  await expect(page.getByText("The reign ends after round 8. The next round is the last.").first()).toBeVisible();
  await expect(page.getByText("Round 8 is the last. When it ends, the most Renown wins.").first()).toBeVisible();

  // In the Standard rules the chip counts to round 30, says how the game can
  // end, and from round 29 stands out.
  await loadSave(page, saveInRound(29));
  const chip = page.getByRole("button", { name: "Round 29 of 30" });
  await expect(chip).toHaveText("Round 29 of 30");
  await expect(chip).toHaveClass(/ending/);
  await expect(chip).toHaveAttribute("title", /reaches 15 Renown, when a round ends with the board full, or when round 30 ends/);
  // Touch and the keyboard reach the same text as the tooltip.
  await chip.focus();
  await page.keyboard.press("Enter");
  const endings = page.getByRole("dialog", { name: "How the game ends" });
  await expect(endings).toContainText("reaches 15 Renown, when a round ends with the board full, or when round 30 ends");
  await endings.getByRole("button", { name: "Close" }).click();
  await expect(endings).toBeHidden();
});

// The buttons keep to one row, above the scoreboard's, with the Crown's
// Levy chip beside the round. Save is in the game menu on a phone.
for (const width of [320, 360]) {
  test(`on a ${width}px phone the round chip shortens rather than wrap the top bar`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: false })));
    const barHeight = () => page.locator(".topbar").evaluate((el) => el.getBoundingClientRect().height);
    const shortLabel = () => page.locator(".round .pill").evaluate((el) => getComputedStyle(el, "::after").content);

    // Round 28: no chip on a narrow bar.
    await loadSave(page, saveInRound(28));
    await expect(page.locator(".round")).toBeHidden();
    await expect(page.locator(".levy-chip")).toBeVisible();
    expect(Math.max(...(await topBarRowOffsets(page, false)))).toBeLessThan(4);
    const plain = await barHeight();
    // Rounds 29 and 30 show it, short, in the same height.
    for (const [round, label] of [[29, "Round 29 of 30"], [30, "Last round"]] as const) {
      await loadSave(page, saveInRound(round));
      const chip = page.getByRole("button", { name: label });
      await expect(chip).toBeVisible();
      expect(await shortLabel()).toBe(`"${round}/30"`);
      expect(Math.max(...(await topBarRowOffsets(page, false)))).toBeLessThan(4);
      expect(await barHeight()).toBe(plain);
    }
    await expect(page.locator(".topbar").getByRole("button", { name: "Save", exact: true })).toBeHidden();
  });
}

for (const width of [360, 412]) {
  test(`on a ${width}px phone the Crown's Voice and Levy chips fit the top bar to the last round`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: false })));
    for (const round of [28, 29, 30]) {
      await loadSave(page, saveInRound(round, { voice: true }));
      await expect(page.locator(".topbar .voice .tiny")).toBeVisible();
      await expect(page.locator(".levy-chip")).toBeVisible();
      expect(Math.max(...(await topBarRowOffsets(page, false))), `round ${round}`).toBeLessThan(4);
    }
    // The game menu saves instead of the top bar.
    await page.getByRole("button", { name: "Main menu" }).click();
    await page.getByRole("button", { name: "Save game" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved\.$/ })).toBeVisible();
  });
}

/** Loads a save from the title screen, as players see it: without the development build's Debug button. */
async function loadSave(page: Page, save: SaveFile) {
  await page.goto("/");
  await page.getByRole("button", { name: "Load game", exact: true }).click();
  await page.getByLabel(/Import a save file/).setInputFiles({ name: `round-${save.state.round}.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(save)) });
  await page.locator(".topbar").getByRole("button", { name: "Debug" }).evaluate((el) => (el.style.display = "none"));
}

/**
 * A two-player hot-seat save in which the Crown's Levy (§27.3) is in force and
 * the player whose turn it is can answer it, played by the AI up to there.
 */
function levySave(): { save: SaveFile; name: string; resource: string } {
  const engine = createRulesEngine(rulesContentFor("greenvale"));
  const seats = ["Ysolde", "Wat"].map((displayName, i) => ({ playerId: `P${i + 1}`, displayName, kind: "human" as const, color: i }));
  const initialState = engine.createGame({
    matchId: "local-e2e-levy",
    seed: "e2e-levy",
    rulesetVersion: RULESET_VERSION,
    ruleset: standardRuleset(2, { targetRenown: 30 }),
    players: seats.map((s) => ({ id: s.playerId, displayName: s.displayName })),
  });
  const rng = createRng(seedRng("e2e-levy-ai"));
  let state = initialState;
  const commandHistory = [];
  while (state.status !== "finished" && !(getLegalActions(engine.ctx, state, state.activePlayerId).canAnswerLevy && !state.pending)) {
    const r = runAiUntilHuman(engine, state, () => true, () => ({ level: "normal", rng }), 1);
    expect(r.commands, "the AI must keep playing").toHaveLength(1);
    commandHistory.push(...r.commands);
    state = r.state;
  }
  const levy = state.crownLevy?.current;
  expect(levy, "the AI must reach a Levy the active player can answer").toBeTruthy();
  const save: SaveFile = { schemaVersion: SAVE_SCHEMA_VERSION, rulesetVersion: RULESET_VERSION, savedAt: new Date(0).toISOString(), mapId: "greenvale", seats, initialState, state, commandHistory };
  const resource = `${levy?.[0]?.toUpperCase()}${levy?.slice(1)}`;
  return { save, name: state.players[state.activePlayerId]?.displayName ?? "?", resource };
}

test("the Crown's Levy is answered from the Quest panel, and the Chronicle says so", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: false })));
  await page.reload();
  await page.getByRole("button", { name: "Load game" }).click();
  const { save, name, resource } = levySave();
  await page.getByLabel(/Import a save file/).setInputFiles({ name: "levy.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(save)) });
  await passCurtain(page);

  // The chip by the round number names this round's Levy and opens the Quest panel.
  const chip = page.getByRole("button", { name: new RegExp(`^The Crown's Levy this round: ${resource}\\.`) });
  await expect(chip).toContainText(`Levy: ${resource}`);
  await chip.click();
  const levy = page.getByRole("region", { name: "The Crown's Levy" });
  await expect(levy).toContainText(`The Crown levies ${resource}`);
  // At a goal of 30 an answer is worth 2 Renown.
  await expect(levy).toContainText("5 → 2 Renown");
  await expect(levy).toContainText("Nobody has answered yet.");

  await levy.getByRole("button", { name: "Answer the Levy" }).click();
  await expect(levy).toContainText(`Answered: ${name}`);
  await expect(levy.getByRole("button", { name: "Answer the Levy" })).toBeDisabled();
  await expect(levy).toContainText("You've answered this round's Levy");
  await page.getByRole("tab", { name: /Chronicle/ }).click();
  await expect(page.getByText(`${name} answered the Crown's Levy with 5 ${resource}: +2 Renown.`).first()).toBeVisible();
  expect(errors).toEqual([]);
});

// Review question: does "Play again" after a tutorial continued from a save
// drop into an unguided game? It opens the New Game setup instead.
test("a finished tutorial loaded from a save leads to a real game setup", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false })));
  await page.reload();
  await page.getByRole("button", { name: "Load game" }).click();
  const save = finishedSave(TUTORIAL_SEED, ["You", "Lord Mumble"], mvpRuleset());
  await page.getByLabel(/Import a save file/).setInputFiles({ name: "tutorial.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(save)) });

  const victory = page.getByRole("dialog", { name: "Victory!" });
  await expect(victory).toBeVisible();
  await expect(victory.getByRole("button", { name: "Play again" })).toHaveCount(0);
  await victory.getByRole("button", { name: "Play a real game" }).click();
  await expect(page.getByRole("heading", { name: "New game" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("tutorial starts and coaches the first placement", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tutorial" }).click();
  await expect(page.getByRole("complementary", { name: "Tutorial" })).toBeVisible();
  await expect(page.getByText(/Place your first Manor/)).toBeVisible();
});

test("an all-computer game can begin, with a note that you will watch", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByLabel("Player 1 type").selectOption("ai");
  await expect(page.getByText("Every seat is a computer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Begin" })).toBeEnabled();
  await page.getByRole("button", { name: "Begin" }).click();
  await expect(page.locator(".round")).toBeVisible();
});

test("New Game starts with the name you last played under", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New game" }).click();
  const yourName = page.getByLabel("Name of player 1");
  await expect(yourName).toHaveValue("Alice");
  await yourName.fill("Lukas");
  await page.getByRole("button", { name: "Begin" }).click();
  await expect(page.locator(".round")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await expect(yourName).toHaveValue("Lukas");
  // Handing the seat to a computer and taking it back keeps your name.
  await page.getByLabel("Player 1 type").selectOption("ai");
  await expect(yourName).not.toHaveValue("Lukas");
  await page.getByLabel("Player 1 type").selectOption("human");
  await expect(yourName).toHaveValue("Lukas");
});

test("New Game deals the chosen island's land anew for each seed", async ({ page }) => {
  const land = async (seed: string) => {
    await page.goto("/");
    await page.getByRole("button", { name: "New game" }).click();
    await expect(page.getByLabel("Island")).toHaveValue("");
    await page.getByLabel("Island").selectOption({ label: "The Greenvale" });
    await page.getByText("Advanced").click();
    await page.getByLabel(/Seed/).fill(seed);
    await page.getByRole("button", { name: "Begin" }).click();
    await expect(page.locator(".map-name")).toHaveText("The Greenvale");
    // Name, Resource and capacity of every Region, in map order.
    return page.locator(".region").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")?.split(", ").slice(0, 3).join(", ")));
  };
  const first = await land("e2e-land-1");
  expect(first.length).toBeGreaterThan(20);
  expect(await land("e2e-land-1")).toEqual(first);
  expect(await land("e2e-land-2")).not.toEqual(first);
});

test("New Game shows the Renown target for each player count", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New game" }).click();
  const goal = page.getByLabel("Renown to win");
  for (const [players, target] of [[2, 15], [3, 15], [4, 13]]) {
    await page.getByRole("radio", { name: String(players), exact: true }).check({ force: true });
    await expect(page.getByRole("radio", { name: new RegExp(`Standard.*${target} Renown`) })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Core.*10 Renown/ })).toBeVisible();
    await expect(goal).toHaveValue(String(target));
  }
  await page.getByRole("radio", { name: /Core/ }).check();
  await expect(goal).toHaveValue("10");
  await page.getByRole("radio", { name: /Standard/ }).check();
  await page.getByRole("button", { name: "Begin" }).click();
  await expect(page.locator(".scoreboard .renown small")).toHaveText(["/13", "/13", "/13", "/13"]);
});

test("New Game plays to the Renown you pick, shows it in the game and remembers it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true, bannerWarning: false })));
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  const goal = page.getByLabel("Renown to win");
  await expect(goal).toHaveValue("15");
  await goal.selectOption("25");
  // A goal you picked stays when the player count or rules change.
  for (const players of [4, 2]) {
    await page.getByRole("radio", { name: String(players), exact: true }).check({ force: true });
    await expect(goal).toHaveValue("25");
    await expect(page.getByRole("radio", { name: /Standard.*25 Renown/ })).toBeChecked();
    await expect(page.getByRole("radio", { name: /Core.*25 Renown/ })).toBeVisible();
  }
  await page.getByLabel("Player 2 type").selectOption("human");
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("e2e-seed");
  await page.getByRole("button", { name: "Begin" }).click();
  await completeSetup(page);

  // The scoreboard, the Renown breakdown and the Players panel.
  const scoreboard = page.getByRole("list", { name: "Scoreboard" });
  await expect(scoreboard.locator(".renown small")).toHaveText(["/25", "/25"]);
  await expect(scoreboard.getByTitle(/^Alice: 2 of 25 Renown\./)).toBeVisible();
  await scoreboard.getByTitle(/^Alice:/).click();
  await expect(page.getByRole("dialog", { name: /Renown of Alice/ })).toContainText("2 of 25 Renown");
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Players" }).click();
  await expect(page.locator(".players").getByTitle(/^Alice: 2 of 25 Renown\./)).toBeVisible();

  // 22 Renown, enough under the default goal, does not end this game; 25 does.
  const setBonusRenown = async (value: number) => {
    await page.getByRole("button", { name: "Debug" }).click();
    const debug = page.getByRole("dialog", { name: "Debug tools" });
    await debug.getByLabel("Bonus Renown").fill(String(value));
    await debug.getByRole("button", { name: "Set bonus Renown" }).click();
    await debug.getByRole("button", { name: "Close" }).click();
  };
  const victory = page.getByRole("dialog", { name: "Victory!" });
  await setBonusRenown(20);
  await endTurn(page);
  await passCurtain(page);
  await endTurn(page);
  await passCurtain(page);
  await expect(victory).toHaveCount(0);
  await setBonusRenown(23);
  await endTurn(page);
  await expect(victory).toBeVisible();
  await expect(victory.getByText("Target 25").first()).toBeVisible();

  // The next New Game offers the goal you picked.
  await page.goto("/");
  await page.getByRole("button", { name: "New game" }).click();
  await expect(goal).toHaveValue("25");
  expect(errors).toEqual([]);
});

test("Standard games retire unclaimed Quests unless New Game turns that off", async ({ page }) => {
  const countdown = page.getByText(`Leaves in ${BALANCE.questExpiryRounds} rounds`);
  for (const expiry of [true, false]) {
    await page.goto("/");
    await page.getByRole("button", { name: "New game" }).click();
    await page.getByText("Advanced").click();
    const option = page.getByRole("checkbox", { name: `Unclaimed Royal Quests leave after ${BALANCE.questExpiryRounds} rounds` });
    await expect(option).toBeChecked();
    if (!expiry) await option.uncheck();
    await page.getByRole("button", { name: "Begin" }).click();
    await page.getByRole("tab", { name: /Quests/ }).click();
    await expect(page.getByRole("region", { name: "Royal Quests" }).getByRole("listitem")).toHaveCount(3);
    if (expiry) await expect(countdown).toHaveCount(3);
    else await expect(countdown).toHaveCount(0);
  }
});

test("board is keyboard operable @mobile", async ({ page }) => {
  await startHotseat(page, "mvp");
  await passCurtain(page);
  const site = page.locator(".site.hl").first();
  await site.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".route.hl").first()).toBeVisible();
});

// Save safety: a save restores exactly what was on screen, and one game's
// autosave never replaces another's.
const ownedRoutes = (page: Page) => page.locator('.route[aria-label*="owned by"]');

async function exitToTitle(page: Page) {
  await page.getByRole("button", { name: "Main menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("button", { name: "Exit to title" }).click();
  await page.getByRole("dialog", { name: "Leave this game?" }).getByRole("button", { name: "Exit to title" }).click();
  await expect(page.getByRole("button", { name: "New game" })).toBeVisible();
}

test("the tutorial does not replace an unfinished game's Continue", async ({ page }) => {
  await startHotseat(page, "mvp");
  await completeSetup(page);
  await exitToTitle(page);

  await page.getByRole("button", { name: "Tutorial" }).click();
  await expect(page.getByRole("complementary", { name: "Tutorial" })).toBeVisible();
  await exitToTitle(page);
  await page.reload();

  await page.getByRole("button", { name: /^Continue/ }).click();
  await passCurtain(page);
  await expect(page.getByRole("region", { name: "Players" })).toContainText("Bertram");
  await expect(page.getByRole("complementary", { name: "Tutorial" })).toHaveCount(0);
});

test("a new game with the same seed keeps the unfinished game's autosave", async ({ page }) => {
  await startHotseat(page, "mvp");
  await completeSetup(page);
  await exitToTitle(page);

  // Same custom seed, so the same match id: still a separate game.
  await beginHotseat(page, "standard");
  await passCurtain(page);
  await exitToTitle(page);

  await page.getByRole("button", { name: "Load game" }).click();
  const rows = page.getByRole("dialog", { name: "Load game" }).getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Core" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Standard" })).toHaveCount(1);
});

test("Save mid-turn keeps the turn's Route after a reload", async ({ page }) => {
  await startHotseat(page);
  await completeSetup(page);
  await debugGrant(page);
  const before = await ownedRoutes(page).count();
  await page.getByRole("button", { name: /Build Route/ }).click();
  await pick(page.locator(".route.hl").first());
  await expect(ownedRoutes(page)).toHaveCount(before + 1);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved." })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Continue/ }).click();
  await passCurtain(page);
  await expect(ownedRoutes(page)).toHaveCount(before + 1);
  // The restored Route is still this turn's action, so it can be undone.
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  // Play on past the manual save, so the autosave holds a newer position.
  await endTurn(page);
  await passCurtain(page);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await exitToTitle(page);

  // The manual save restores the same turn in progress.
  await page.getByRole("button", { name: "Load game" }).click();
  const manual = page.getByRole("dialog", { name: "Load game" }).getByRole("listitem").filter({ hasText: "Saved" });
  await manual.getByRole("button", { name: /Alice/ }).click();
  await passCurtain(page);
  await expect(ownedRoutes(page)).toHaveCount(before + 1);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  // Only looking at the older save must not overwrite the newer autosave.
  await exitToTitle(page);
  await page.getByRole("button", { name: /^Continue/ }).click();
  await passCurtain(page);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("the game menu keeps the game open, exports a save and asks before leaving", async ({ page }) => {
  await startHotseat(page, "mvp");
  await completeSetup(page);

  // ☰ opens a menu instead of leaving; Resume returns to the same game.
  await page.getByRole("button", { name: "Main menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await menu.getByRole("button", { name: "Resume" }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Players" })).toContainText("Bertram");

  // Settings opened from the menu returns to the menu.
  await page.getByRole("button", { name: "Main menu" }).click();
  await menu.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: "Close" }).click();
  await expect(menu).toBeVisible();

  // Export save file downloads a save that imports again.
  const [download] = await Promise.all([page.waitForEvent("download"), menu.getByRole("button", { name: "Export save file" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^manors-local-e2e-seed-r1\.json$/);
  const file = await download.path();
  const save = JSON.parse(await readFile(file, "utf8")) as { schemaVersion: number; seats: { displayName: string }[] };
  expect(save.schemaVersion).toBe(1);
  expect(save.seats.map((s) => s.displayName)).toEqual(["Alice", "Bertram"]);

  // Leaving asks first; Stay keeps the game.
  await menu.getByRole("button", { name: "Exit to title" }).click();
  const leave = page.getByRole("dialog", { name: "Leave this game?" });
  await expect(leave).toContainText("saved automatically");
  await leave.getByRole("button", { name: "Stay" }).click();
  await menu.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("region", { name: "Players" })).toBeVisible();
  await exitToTitle(page);

  // The Load list describes each save and deletes only after confirmation.
  await expect(page.getByRole("button", { name: /^Continue/ })).toContainText("Round 1");
  await page.getByRole("button", { name: "Load game" }).click();
  const load = page.getByRole("dialog", { name: "Load game" });
  const row = load.getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Alice");
  await expect(row).toContainText("Bertram");
  await expect(row).toContainText("Round 1");
  await expect(row).toContainText("Autosave");
  await row.getByRole("button", { name: "Delete save" }).click();
  await expect(row.getByRole("group", { name: "Delete this save?" })).toBeVisible();
  await row.getByRole("button", { name: "Keep" }).click();
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "Delete save" }).click();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);

  // A rejected file is reported; a later good import clears the report.
  await load.getByLabel("Import a save file").setInputFiles({ name: "junk.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(load).toContainText("not a Manors & Menaces save");
  await load.getByLabel("Import a save file").setInputFiles(file);
  await passCurtain(page);
  await expect(page.getByRole("region", { name: "Players" })).toContainText("Bertram");
  await exitToTitle(page);
  await page.getByRole("button", { name: "Load game" }).click();
  await expect(load).toBeVisible();
  await expect(load).not.toContainText("not a Manors & Menaces save");
});

test("leaving warns instead of claiming a game is saved when saving fails", async ({ page }) => {
  await startHotseat(page, "mvp");
  await completeSetup(page);

  // Storage starts failing (quota, blocked site data): the next autosave fails.
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => {
      throw new DOMException("blocked", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: /Assign Banners →/ }).click();
  await page.getByRole("button", { name: "Main menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu.getByRole("alert")).toContainText("Autosave is not working");

  await menu.getByRole("button", { name: "Exit to title" }).click();
  const leave = page.getByRole("dialog", { name: "Leave this game?" });
  await expect(leave).toContainText("If you leave now, it is lost");
  await expect(leave).not.toContainText("saved automatically");
  await expect(leave.getByRole("button", { name: "Export save file" })).toBeVisible();
  await leave.getByRole("button", { name: "Leave without saving" }).click();
  await expect(page.getByRole("button", { name: "New game" })).toBeVisible();
});
