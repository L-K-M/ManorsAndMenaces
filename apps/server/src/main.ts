// Manors & Menaces game server.
//
// Environment (all optional):
//   PORT          listen port (default 8787)
//   HOST          listen address (default 0.0.0.0)
//   DB_PATH       SQLite file (default ./data/manors.sqlite; ":memory:" for ephemeral)
//   WEB_DIST      directory of the built web client to serve (default ../web/dist if present)
//   CORS_ORIGIN   allowed origin for the API (default *)
//   AI_DELAY_MS   pause between server-side AI actions (default 700)

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? resolve(process.cwd(), "data/manors.sqlite");
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

const app = createApp({
  dbPath,
  webDist: process.env.WEB_DIST ?? resolve(here, "../../web/dist"),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  aiDelayMs: Number(process.env.AI_DELAY_MS ?? 700),
});
const port = Number(process.env.PORT ?? 8787);
app.server.listen(port, process.env.HOST ?? "0.0.0.0", () => {
  console.log(`Manors & Menaces server listening on :${port} (db ${dbPath})`);
});
const stop = () => void app.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
