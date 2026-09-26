// The operator's invite command for an invite-only server (INVITE_ONLY):
//
//   node server.mjs invites create NAME [--uses N] [--days N] [--invites N]
//   node server.mjs invites list
//   node server.mjs invites revoke ID
//
// (`pnpm invites …` in a checkout). It works on the server's database, so
// run it where the server runs, with the same DB_PATH; the server need not
// stop. PUBLIC_URL, if set, makes it print whole links.

import { existsSync } from "node:fs";
import { Invites, INVITES_PER_PERSON, inviteName, type InviteListing } from "./invites.js";
import { Store } from "./store.js";

export interface InvitesCommandOptions {
  dbPath: string;
  /** Where players open the game, for whole links. */
  publicUrl?: string | undefined;
  out?: (line: string) => void;
  err?: (line: string) => void;
}

const USAGE = `Usage:
  invites create NAME [--uses N] [--days N] [--invites N]
      A personal invite link for NAME.
      --uses N     devices it admits (default: any number; 1 for a single-use link)
      --days N     days the link admits new devices (default: no limit)
      --invites N  invites NAME may make for others (default ${INVITES_PER_PERSON}; 0 for none)
  invites list
      Every invite: who made it, the devices and players it let in, its link.
  invites revoke ID
      Shuts out the devices and players an invite let in. The people they
      invited keep their own invites.`;

class UsageError extends Error {}

/** Runs the command; returns the process exit status. */
export function invitesCommand(args: string[], opts: InvitesCommandOptions): number {
  const out = opts.out ?? ((line: string) => console.log(line));
  const err = opts.err ?? ((line: string) => console.error(line));
  const [sub, ...rest] = args;
  if (sub === undefined || sub === "help" || sub === "--help") {
    out(USAGE);
    return sub === undefined ? 1 : 0;
  }
  // A missing file would be created empty: invites no server knows about.
  if (opts.dbPath === ":memory:" || !existsSync(opts.dbPath)) {
    err(`No database at ${opts.dbPath}. Run this where the server runs, with the same DB_PATH.`);
    return 1;
  }
  const store = new Store(opts.dbPath);
  try {
    const invites = new Invites(store);
    const link = (code: string) => (opts.publicUrl ? `${opts.publicUrl.replace(/\/+$/, "")}/invite/${code}` : `/invite/${code}`);
    if (sub === "create") {
      const { words, flags } = parse(rest, ["uses", "days", "invites"]);
      const name = inviteName(words.join(" "));
      if (!name) throw new UsageError("create needs the name of the person the invite is for");
      const uses = count(flags.uses, "--uses", 1);
      const days = count(flags.days, "--days", 1);
      const quota = count(flags.invites, "--invites", 0) ?? INVITES_PER_PERSON;
      const invite = invites.create({ name, maxDevices: uses, days, quota });
      out(`Invite for ${invite.name} (id ${invite.id}): ${devices(uses)}, ${invite.expires_at ? `link open until ${day(invite.expires_at)}` : "no expiry"}, ${quota} invites of their own.`);
      out(link(invite.code));
      if (!opts.publicUrl) out("Put your server's address in front, or set PUBLIC_URL to print whole links.");
      return 0;
    }
    if (sub === "list") {
      if (rest.length) throw new UsageError(`list takes no arguments`);
      const all = invites.list();
      if (!all.length) out("No invites yet. Make one with: invites create NAME");
      for (const i of all) {
        out(`${i.id}  ${i.name}, invited by ${i.invitedBy ?? "you"}, ${status(i)}`);
        out(`  ${i.devices} ${i.devices === 1 ? "device" : "devices"} (${i.maxDevices ?? "any number"} allowed), ${i.invitesMade} of ${i.quota} invites made`);
        if (i.players.length) out(`  players: ${i.players.join(", ")}`);
        out(`  ${link(i.code)}`);
      }
      return 0;
    }
    if (sub === "revoke") {
      if (rest.length !== 1) throw new UsageError("revoke takes one invite id");
      const id = rest[0] as string;
      const found = invites.list().find((i) => i.id === id || i.code === id.toLowerCase());
      if (!found) {
        err(`No invite ${id}. See: invites list`);
        return 1;
      }
      if (!invites.revoke(found.id)) {
        out(`${found.name}'s invite (${found.id}) was already revoked.`);
        return 0;
      }
      out(`Revoked ${found.name}'s invite (${found.id}): its ${found.devices} ${found.devices === 1 ? "device" : "devices"} and ${found.players.length} ${found.players.length === 1 ? "player" : "players"} are shut out.`);
      return 0;
    }
    throw new UsageError(`Unknown command: ${sub}`);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    err(e.message);
    err(USAGE);
    return 1;
  } finally {
    store.db.close();
  }
}

function parse(args: string[], names: string[]): { words: string[]; flags: Record<string, string> } {
  const words: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split("=", 2) as [string, string | undefined];
    if (!names.includes(name)) throw new UsageError(`Unknown option: --${name}`);
    const value = inline ?? args[++i];
    if (value === undefined) throw new UsageError(`--${name} needs a number`);
    flags[name] = value;
  }
  return { words, flags };
}

/** A whole number of at least `min`, or null when the option is absent. */
function count(value: string | undefined, option: string, min: number): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min) throw new UsageError(`${option} must be a whole number of at least ${min}, not "${value}"`);
  return n;
}

const devices = (uses: number | null) => (uses === null ? "any number of devices" : uses === 1 ? "one device" : `up to ${uses} devices`);
const day = (iso: string) => iso.slice(0, 10);

function status(i: InviteListing): string {
  if (i.revoked) return "revoked";
  if (i.expiresAt && i.expiresAt <= new Date().toISOString()) return `link expired ${day(i.expiresAt)}`;
  if (i.maxDevices !== null && i.devices >= i.maxDevices) return "active, link used up";
  return i.expiresAt ? `active, link open until ${day(i.expiresAt)}` : "active";
}
