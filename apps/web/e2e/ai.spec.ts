import { expect, test, type Page } from "@playwright/test";

// Computer players decide in a Web Worker (lib/game/ai.worker.ts) and pace
// their moves on the UI thread.

test("an all-computer game plays on through a worker without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`);
  });
  const workers: string[] = [];
  page.on("worker", (w) => workers.push(w.url()));

  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "4", exact: true }).check({ force: true });
  await page.getByLabel("Player 1 type").selectOption("ai");
  await page.getByText("Advanced").click();
  await page.getByLabel(/Seed/).fill("e2e-ai-worker");
  await page.getByRole("button", { name: "Begin" }).click();

  await expect(page.locator(".round")).toHaveText(/Round [3-9]/, { timeout: 60_000 });
  expect(workers.some((u) => u.includes("ai.worker"))).toBe(true);
  expect(errors).toEqual([]);
});

test("failing computer decisions are reported and the game goes on", async ({ page }) => {
  // Every decision from the worker fails; the session falls back to the
  // same progression moves as the server and tells the players.
  await page.route("**/ai.worker.ts*", (route) =>
    route.fulfill({ contentType: "text/javascript", body: `addEventListener("message", (e) => postMessage({ id: e.data.id, ok: false, message: "forced failure" }));` }),
  );
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 1 type").selectOption("ai");
  await page.getByRole("button", { name: "Begin" }).click();

  await expect(page.getByRole("alert")).toContainText("couldn't settle on a move");
  await expect(page.locator(".round")).toHaveText(/Round [2-9]/, { timeout: 30_000 });
  await page.getByRole("tab", { name: "Chronicle" }).click();
  await expect(page.locator(".side").getByText(/couldn't settle on a move/).first()).toBeVisible();
});

/**
 * Serves the real AI worker with `prelude` run first, so a test can tamper
 * with the requests or replies of an otherwise working worker.
 */
async function wrapAiWorker(page: Page, prelude: string) {
  await page.route("**/ai.worker.ts*", async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: `${prelude}\n${await res.text()}` });
  });
}

async function startTwoComputerGame(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("mm.settings.v1", JSON.stringify({ animationSpeed: "off", sound: false, privacyCurtain: true }));
    indexedDB.deleteDatabase("manors-menaces");
  });
  await page.reload();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("radio", { name: "2", exact: true }).check({ force: true });
  await page.getByLabel("Player 1 type").selectOption("ai");
  await page.getByRole("button", { name: "Begin" }).click();
}

test("a one-off fallback notice clears once computers play normally again", async ({ page }) => {
  // Only the first decision fails; the real worker answers the rest.
  await wrapAiWorker(
    page,
    `let failedOnce = false;
    addEventListener("message", (e) => {
      if (failedOnce) return;
      failedOnce = true;
      e.stopImmediatePropagation();
      postMessage({ id: e.data.id, ok: false, message: "forced failure" });
    });`,
  );
  await startTwoComputerGame(page);

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("couldn't settle on a move");
  await expect(alert).toHaveCount(0, { timeout: 20_000 });
  // The Chronicle keeps the record.
  await page.getByRole("tab", { name: "Chronicle" }).click();
  await expect(page.locator(".side").getByText(/couldn't settle on a move/).first()).toBeVisible();
});

test("a debug command while a computer is thinking does not stall the game", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // Hold the first reply long enough to change the game underneath it.
  await wrapAiWorker(
    page,
    `const reply = self.postMessage.bind(self);
    let heldOnce = false;
    self.postMessage = (m) => {
      if (heldOnce) return reply(m);
      heldOnce = true;
      setTimeout(() => reply(m), 3000);
    };`,
  );
  await startTwoComputerGame(page);

  await expect(page.getByText(/is thinking/)).toBeVisible();
  await page.getByRole("button", { name: "Debug" }).click();
  await page.getByRole("button", { name: "Grant 5 of each resource" }).click();
  await page.getByRole("dialog", { name: "Debug tools" }).getByRole("button", { name: "Close" }).click();

  // The stale decision is dropped and the computer decides again.
  await expect(page.locator(".round")).toHaveText(/Round [2-9]/, { timeout: 30_000 });
  expect(errors).toEqual([]);
});
