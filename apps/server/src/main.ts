// Manors & Menaces game server.
//
// Environment (all optional):
//   PORT          listen port (default 8787)
//   HOST          listen address (default 0.0.0.0)
//   DB_PATH       SQLite file (default ./data/manors.sqlite; ":memory:" for ephemeral)
//   WEB_DIST      directory of the built web client to serve (default ../web/dist if present)
//   CORS_ORIGIN   allowed origin for the API (default *)
//   AI_DELAY_MS   pause between server-side AI actions (default 700)
//   TRUST_PROXY   number of reverse proxies in front of the server (default 0).
//                 When set, rate limits key on the client address those proxies
//                 report in X-Forwarded-For (or Forwarded, if X-Forwarded-For is
//                 absent) instead of on the proxy's own address. Set it only when
//                 every request passes through exactly that many proxies, each
//                 appending the address it saw; otherwise clients can spoof it.
//
// Fatal errors (the port is taken, an uncaught exception) exit with status 1
// so a supervisor such as Docker restarts the server; AI seats resume then.

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const here = dirname(fileURLToPath(import.meta.url));

function fail(message: string, error?: unknown): never {
  console.error(message, ...(error === undefined ? [] : [error]));
  process.exit(1);
}

const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
if (!Number.isInteger(trustProxy) || trustProxy < 0) fail(`TRUST_PROXY must be a whole number of proxies (0 or more), not "${process.env.TRUST_PROXY}"`);

const dbPath = process.env.DB_PATH ?? resolve(process.cwd(), "data/manors.sqlite");
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

const app = createApp({
  dbPath,
  webDist: process.env.WEB_DIST ?? resolve(here, "../../web/dist"),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  aiDelayMs: Number(process.env.AI_DELAY_MS ?? 700),
  trustProxy,
});
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
app.server.on("error", (e: NodeJS.ErrnoException) => fail(`Cannot listen on ${host}:${port} (${e.code ?? e.message})`, e.code ? undefined : e));
app.server.listen(port, host, () => {
  console.log(`Manors & Menaces server listening on :${port} (db ${dbPath})`);
});
// A process in an unknown state could corrupt matches: log and exit, and let
// the supervisor restart it.
process.on("unhandledRejection", (e) => fail("unhandled rejection", e));
process.on("uncaughtException", (e) => fail("uncaught exception", e));
const stop = () => void app.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
