#!/usr/bin/env node
// Builds what ships and smoke-tests it, so CI finds a broken production build
// before a release does:
//   1. the web bundle (`vite build`; the Vite config fails on bundler warnings);
//   2. the server bundle, built as scripts/build.sh does. esbuild exits 0 on
//      warnings, but each one flags likely-broken code, so any warning fails;
//   3. the third-party notices both builds write (scripts/third-party-notices.mjs):
//      present, naming components certain to be bundled, and named in the
//      banner of every web chunk;
//   4. the bundled server started against the fresh web build: it must answer
//      /api/health and serve the app shell, its script, the service worker and
//      the notices.
//
// Usage: node scripts/check-build.mjs   (pnpm build:check)

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const STARTUP_TIMEOUT_MS = 30_000;
const NOTICES = "Third-Party-Notices.txt";
// Entries start with "<package> <version>"; no versions, so upgrades pass.
const WEB_NOTICE_ENTRIES = ["svelte", "@fontsource/alegreya", "@fontsource/alegreya-sans", "@fontsource/alegreya-sc"];
const SERVER_NOTICE_ENTRIES = ["ws", "nodemailer"];

// Thrown rather than exiting at once so the smoke test can stop its server.
function fail(message) {
  throw new Error(message);
}

function build(pkg) {
  console.log(`==> pnpm --filter ${pkg} build`);
  const args = ["--filter", pkg, "build"];
  // Windows installs pnpm as a pnpm.cmd shim, which Node launches only through
  // a shell. The arguments are fixed package names, so joining needs no quoting.
  const run =
    process.platform === "win32"
      ? spawnSync(`pnpm ${args.join(" ")}`, { cwd: root, encoding: "utf8", shell: true })
      : spawnSync("pnpm", args, { cwd: root, encoding: "utf8" });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  process.stdout.write(output);
  if (run.error) fail(`could not run pnpm: ${run.error.message}`);
  if (run.status !== 0) fail(`${pkg} build exited with ${run.status}`);
  return output;
}

function checkNotices(dir, entries, texts = []) {
  const file = join(root, dir, NOTICES);
  const notices = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (!notices.trim()) fail(`${dir}/${NOTICES} is missing or empty`);
  for (const entry of entries) if (!notices.includes(`\n${entry} `)) fail(`${dir}/${NOTICES} has no entry for ${entry}`);
  for (const text of texts) if (!notices.includes(text)) fail(`${dir}/${NOTICES} does not contain "${text}"`);
}

// Minifying drops license comments; each chunk must point to the notices instead.
function checkBanners(dir) {
  const chunks = readdirSync(join(root, dir)).filter((name) => /\.m?js$/.test(name));
  if (chunks.length === 0) fail(`${dir} holds no scripts`);
  for (const chunk of chunks) {
    if (!readFileSync(join(root, dir, chunk), "utf8").includes(NOTICES)) fail(`${dir}/${chunk} does not name ${NOTICES} in a banner`);
  }
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
    const notices = await get(base, NOTICES);
    if (notices.status !== 200 || !notices.type.startsWith("text/plain") || !notices.body.includes("\nsvelte ")) fail(`/${NOTICES} is not served as text`);
  } finally {
    server.kill();
  }
  console.log("==> build check passed");
}

try {
  build("@manors-menaces/web");
  const serverOutput = build("@manors-menaces/server");
  if (serverOutput.includes("[WARNING]")) fail("esbuild reported warnings for the server bundle");
  console.log(`==> ${NOTICES} in both builds`);
  // OFL-1.1 requires the license text with every copy of the Alegreya fonts.
  checkNotices("apps/web/dist", WEB_NOTICE_ENTRIES, ["SIL Open Font License"]);
  checkBanners("apps/web/dist/assets");
  checkNotices("apps/server/dist", SERVER_NOTICE_ENTRIES);
  await smokeTest();
} catch (e) {
  console.error(`\nbuild check failed: ${e.message}`);
  process.exitCode = 1;
}
