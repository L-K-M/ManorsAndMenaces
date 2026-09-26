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
//                 X-Forwarded-For is read first when present, so a proxy that
//                 sets only Forwarded must still strip or overwrite it.
//   VAPID_SUBJECT contact for Web Push services (RFC 8292): mailto:you@example.org
//                 or an https: URL of yours (default: the project's repository).
//                 Push reaches players whose app is closed; it needs the web
//                 client served over HTTPS.
//   SMTP_URL      turns on turn emails for players who confirm an address in
//                 the lobby: smtps://user:password@smtp.example.org (TLS, port
//                 465) or smtp://user:password@smtp.example.org:587 (STARTTLS).
//                 Percent-encode reserved characters in the user and password.
//                 Needs MAIL_FROM and PUBLIC_URL too.
//   MAIL_FROM     sender of turn emails: Manors & Menaces <turns@example.org>
//   PUBLIC_URL    where players open the game (this server, serving WEB_DIST),
//                 like https://play.example.org; email links point there.
//   MAIL_OUTBOX_DIR  instead of SMTP_URL, for development: write each email to
//                 this directory as an .eml file rather than sending it.
//   BACKGROUND_PING_SECONDS  how often the Android app's background connection
//                 is pinged (default 600, 60 to 3600). Every ping wakes the
//                 phone; lower it only when a proxy closes idle WebSockets
//                 sooner (Cloudflare Free/Pro: 100 s, so 90).
//   See docs/notifications.md.
//   INVITE_ONLY   true to open the game only to people with a personal invite
//                 (default false). Make invites with the invites command below;
//                 everyone invited may invite ten more from the online lobby.
//                 See docs/invites.md.
//
// `node server.mjs invites create|list|revoke …` (`pnpm invites …` in a
// checkout) manages invites instead of starting the server; see
// inviteCommand.ts. It uses the same DB_PATH, and PUBLIC_URL for whole links.
//
// Fatal errors (the port is taken, an uncaught exception) exit with status 1
// so a supervisor such as Docker restarts the server; AI seats resume then.

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { invitesCommand } from "./inviteCommand.js";
import { mailConfigFromEnv, type MailConfig } from "./mail.js";

const here = dirname(fileURLToPath(import.meta.url));

function fail(message: string, error?: unknown): never {
  console.error(message, ...(error === undefined ? [] : [error]));
  process.exit(1);
}

const dbPath = process.env.DB_PATH ?? resolve(process.cwd(), "data/manors.sqlite");

if (process.argv[2] === "invites") process.exit(invitesCommand(process.argv.slice(3), { dbPath, publicUrl: process.env.PUBLIC_URL || undefined }));

const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
if (!Number.isInteger(trustProxy) || trustProxy < 0) fail(`TRUST_PROXY must be a whole number of proxies (0 or more), not "${process.env.TRUST_PROXY}"`);

const backgroundPingSeconds = Number(process.env.BACKGROUND_PING_SECONDS ?? 600);
if (!Number.isInteger(backgroundPingSeconds) || backgroundPingSeconds < 60 || backgroundPingSeconds > 3600) {
  fail(`BACKGROUND_PING_SECONDS must be a whole number of seconds from 60 to 3600, not "${process.env.BACKGROUND_PING_SECONDS}"`);
}

const inviteOnlySetting = (process.env.INVITE_ONLY ?? "").trim().toLowerCase();
if (!["", "true", "false", "1", "0"].includes(inviteOnlySetting)) fail(`INVITE_ONLY must be true or false, not "${process.env.INVITE_ONLY}"`);
const inviteOnly = inviteOnlySetting === "true" || inviteOnlySetting === "1";

let email: MailConfig | null = null;
try {
  email = mailConfigFromEnv(process.env);
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}

if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });

const app = createApp({
  dbPath,
  webDist: process.env.WEB_DIST ?? resolve(here, "../../web/dist"),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  aiDelayMs: Number(process.env.AI_DELAY_MS ?? 700),
  trustProxy,
  backgroundHeartbeatMs: backgroundPingSeconds * 1000,
  ...(process.env.VAPID_SUBJECT ? { push: { subject: process.env.VAPID_SUBJECT } } : {}),
  ...(email ? { email } : {}),
  inviteOnly,
});
console.log(inviteOnly ? "Invite-only: on (make invites with: node server.mjs invites create NAME)" : "Invite-only: off, the game is open to everyone");
if (!email) console.log("Turn emails: off (set SMTP_URL, MAIL_FROM and PUBLIC_URL to turn them on)");
else if (!email.verify) console.log(`Turn emails: written to ${process.env.MAIL_OUTBOX_DIR}, not sent`);
else {
  // A mail server that is down now may be back later: report, keep running.
  email
    .verify()
    .then(() => console.log("Turn emails: on, the SMTP server accepted the login"))
    .catch((e: unknown) => console.error(`Turn emails: cannot use the SMTP server (${e instanceof Error ? e.message : String(e)}); emails fail until that is fixed`));
}
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const listenFailed = (e: NodeJS.ErrnoException) => fail(`Cannot listen on ${host}:${port} (${e.code ?? e.message})`, e.code ? undefined : e);
app.server.once("error", listenFailed);
app.server.listen(port, host, () => {
  // Later server errors (say EMFILE on accept) are not listen failures: they
  // reach the uncaught exception handler below with their own message.
  app.server.off("error", listenFailed);
  console.log(`Manors & Menaces server listening on :${port} (db ${dbPath})`);
});
// A process in an unknown state could corrupt matches: log and exit, and let
// the supervisor restart it.
process.on("unhandledRejection", (e) => fail("unhandled rejection", e));
process.on("uncaughtException", (e) => fail("uncaught exception", e));
const stop = () => void app.close().then(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
