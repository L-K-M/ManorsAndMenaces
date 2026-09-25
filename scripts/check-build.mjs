#!/usr/bin/env node
// Builds what ships and smoke-tests it, so CI finds a broken production build
// before a release does:
//   1. the web bundle (`vite build`; the Vite config fails on bundler warnings);
//   2. the server bundle, built as scripts/build.sh does. esbuild exits 0 on
//      warnings, but each one flags likely-broken code, so any warning fails;
//   3. the bundled server started against the fresh web build: it must answer
//      /api/health and serve the app shell, its script and the service worker.
//
// Usage: node scripts/check-build.mjs   (pnpm build:check)

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STARTUP_TIMEOUT_MS = 30_000;

// Thrown rather than exiting at once so the smoke test can stop its server.
function fail(message) {
  throw new Error(message);
}

function build(pkg) {
  console.log(`==> pnpm --filter ${pkg} build`);
  const run = spawnSync("pnpm", ["--filter", pkg, "build"], { cwd: root, encoding: "utf8" });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  process.stdout.write(output);
  if (run.error) fail(`could not run pnpm: ${run.error.message}`);
  if (run.status !== 0) fail(`${pkg} build exited with ${run.status}`);
  return output;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function get(base, path) {
  const res = await fetch(new URL(path, base));
  return { status: res.status, type: res.headers.get("content-type") ?? "", body: await res.text() };
}

async function smokeTest() {
  console.log("==> smoke test: apps/server/dist/server.mjs serving apps/web/dist");
  const port = await freePort();
  const base = `http://127.0.0.1:${port}/`;
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", join(root, "apps/server/dist/server.mjs")], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", DB_PATH: ":memory:", WEB_DIST: join(root, "apps/web/dist") },
    stdio: ["ignore", "inherit", "inherit"],
  });
  let exited = null;
  server.on("exit", (code, signal) => (exited = signal ?? code));

  try {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    for (;;) {
      if (exited !== null) fail(`the server exited during startup (${exited})`);
      const health = await get(base, "api/health").catch(() => null);
      if (health?.status === 200) break;
      if (Date.now() > deadline) fail(`/api/health did not answer 200 within ${STARTUP_TIMEOUT_MS / 1000} s`);
      await new Promise((r) => setTimeout(r, 500));
    }

    const shell = await get(base, "");
    if (shell.status !== 200 || !shell.body.includes('<div id="app">')) fail("/ does not serve the app shell");
    const script = shell.body.match(/<script type="module"[^>]*src="\.?\/?([^"]+)"/)?.[1];
    if (!script) fail("the app shell references no module script");
    const bundle = await get(base, script);
    if (bundle.status !== 200 || !bundle.type.includes("javascript")) fail(`/${script} is not served as JavaScript`);
    const worker = await get(base, "sw.js");
    if (worker.status !== 200 || !worker.type.includes("javascript")) fail("/sw.js is not served as JavaScript");
  } finally {
    server.kill();
  }
  console.log("==> build check passed");
}

try {
  build("@manors-menaces/web");
  const serverOutput = build("@manors-menaces/server");
  if (serverOutput.includes("[WARNING]")) fail("esbuild reported warnings for the server bundle");
  await smokeTest();
} catch (e) {
  console.error(`\nbuild check failed: ${e.message}`);
  process.exitCode = 1;
}
