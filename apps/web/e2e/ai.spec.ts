import { expect, test } from "@playwright/test";

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
