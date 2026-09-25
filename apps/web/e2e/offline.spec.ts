import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

// Offline play and updates of the installed web app (spec §76). The service
// worker only registers in production builds, so these tests build the app
// and serve it with `vite preview` on a free port instead of using the dev
// server from playwright.config.ts.

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const viteBin = join(webRoot, "node_modules/vite/bin/vite.js");
const STARTUP_TIMEOUT_MS = 30_000;

let workDir = "";
let preview: ChildProcess | null = null;
let port = 0;
const baseURL = () => `http://127.0.0.1:${port}/`;

function build(name: string, ...args: string[]): string {
  const outDir = join(workDir, name);
  execFileSync(process.execPath, [viteBin, "build", "--outDir", outDir, "--emptyOutDir", "--logLevel", "warn", ...args], { cwd: webRoot, stdio: "inherit" });
  return outDir;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      probe.close(() => (address && typeof address === "object" ? resolve(address.port) : reject(new Error("no port"))));
    });
  });
}

async function stopPreview() {
  const running = preview;
  preview = null;
  if (!running || running.exitCode !== null) return;
  await new Promise((resolve) => {
    running.once("exit", resolve);
    running.kill();
  });
}

/** Serves `outDir` at the fixed test origin, replacing whatever was served before (a "deploy"). */
async function serve(outDir: string) {
  await stopPreview();
  preview = spawn(process.execPath, [viteBin, "preview", "--outDir", outDir, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: webRoot,
    stdio: "ignore",
  });
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  for (;;) {
    const ok = await fetch(baseURL())
      .then((res) => res.ok)
      .catch(() => false);
    if (ok) return;
    if (Date.now() > deadline) throw new Error(`vite preview did not start on port ${port}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Waits until the page is controlled by an active service worker that has finished precaching. */
async function waitForServiceWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

const entryScript = (page: Page) => page.locator('script[type="module"]').first().getAttribute("src");
const cacheNames = (page: Page) => page.evaluate(() => caches.keys());
/** Whether the old release's cache is gone and exactly one other has replaced it. */
async function onlyCacheIsNewerThan(page: Page, old: string[]) {
  const now = await cacheNames(page);
  return now.length === 1 && !old.includes(now[0]!);
}

let v1 = "";
let v2 = "";

test.describe("installed web app", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test.beforeAll(async () => {
    workDir = mkdtempSync(join(tmpdir(), "mm-offline-"));
    v1 = build("v1");
    // Any change to the bundle is a new release; an unminified build is a cheap one.
    v2 = build("v2", "--minify", "false");
    port = await freePort();
  });

  test.afterAll(async () => {
    await stopPreview();
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  test("the production build ships no source maps", () => {
    const assets = readdirSync(join(v1, "assets"));
    expect(assets.filter((f) => f.endsWith(".map"))).toEqual([]);
    for (const js of assets.filter((f) => f.endsWith(".js"))) {
      expect(readFileSync(join(v1, "assets", js), "utf8")).not.toContain("sourceMappingURL");
    }
    expect(existsSync(join(v1, "sw.js"))).toBe(true);
  });

  test("a visited app starts offline", async ({ page, context }) => {
    await serve(v1);
    await page.goto(baseURL());
    await expect(page.getByRole("button", { name: "New game" })).toBeVisible();
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("button", { name: "New game" })).toBeVisible();

    // A cold start: a fresh tab, not just a reload of this one.
    const fresh = await context.newPage();
    await fresh.goto(baseURL());
    await expect(fresh.getByRole("button", { name: "New game" })).toBeVisible();
    await fresh.getByRole("button", { name: "New game" }).click();
    await expect(fresh.getByRole("button", { name: "Begin" })).toBeVisible();
  });

  test("a page left open across a release offers to reload into it", async ({ page }) => {
    await serve(v1);
    await page.goto(baseURL());
    await waitForServiceWorker(page);
    const [v1Script, v1Caches] = [await entryScript(page), await cacheNames(page)];
    expect(v1Caches).toHaveLength(1);

    await serve(v2);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
    const prompt = page.getByRole("status").filter({ hasText: "A new version of the realm is ready." });
    await expect(prompt).toBeVisible();
    // Nothing changes until the player chooses to reload.
    expect(await entryScript(page)).toBe(v1Script);

    await prompt.getByRole("button", { name: "Reload" }).click();
    await expect.poll(() => entryScript(page)).not.toBe(v1Script);
    await expect(page.getByRole("button", { name: "New game" })).toBeVisible();
    await expect(prompt).toBeHidden();
    await expect.poll(() => onlyCacheIsNewerThan(page, v1Caches)).toBe(true);
  });

  test("a page that already runs the new release updates its worker silently", async ({ page, context }) => {
    await serve(v1);
    await page.goto(baseURL());
    await waitForServiceWorker(page);
    const v1Caches = await cacheNames(page);

    // Navigations are network-first, so this reload already runs the new release.
    await serve(v2);
    await page.reload();
    await expect(page.getByRole("button", { name: "New game" })).toBeVisible();
    await expect.poll(() => onlyCacheIsNewerThan(page, v1Caches)).toBe(true);
    await expect(page.getByRole("status").filter({ hasText: "A new version" })).toBeHidden();

    // The new release now starts offline.
    await context.setOffline(true);
    const v2Script = await entryScript(page);
    await page.reload();
    await expect(page.getByRole("button", { name: "New game" })).toBeVisible();
    expect(await entryScript(page)).toBe(v2Script);
  });
});
