import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The invite-only game server the e2e tests start (playwright.config.ts). */
export const INVITE_SERVER = "http://localhost:8789";
/** Its database, a file so that the operator's command can reach it. */
export const INVITE_DB = join(tmpdir(), "manors-menaces-e2e-invites.sqlite");

/** Runs the operator's `invites create NAME` on the e2e server's database; returns the link it prints. */
export function operatorInvite(name: string): string {
  const out = execFileSync("tsx", ["../server/src/main.ts", "invites", "create", name], {
    env: { ...process.env, DB_PATH: INVITE_DB, PUBLIC_URL: INVITE_SERVER },
    encoding: "utf8",
  });
  const link = /^http\S+\/invite\/\w+$/m.exec(out)?.[0];
  if (!link) throw new Error(`no invite link in: ${out}`);
  return link;
}
