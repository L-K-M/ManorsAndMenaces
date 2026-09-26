import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { invitesCommand } from "../src/inviteCommand.js";

// The operator's `invites` command works on the database of a running server.

const PUBLIC_URL = "https://play.example.org";
let app: ReturnType<typeof createApp> | null = null;
let base = "";
let dbPath = "";

async function startServer() {
  dbPath = join(mkdtempSync(join(tmpdir(), "mm-invites-")), "manors.sqlite");
  app = createApp({ dbPath, webDist: null, rateLimitPerSecond: 10_000, inviteOnly: true });
  await new Promise<void>((r) => app?.server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await app?.close();
  app = null;
});

function run(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const status = invitesCommand(args, { dbPath, publicUrl: PUBLIC_URL, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { status, out: out.join("\n"), err: err.join("\n") };
}

const codeIn = (text: string) => /\/invite\/([a-z0-9]+)/.exec(text)?.[1] ?? "";
const accept = (code: string) => fetch(`${base}/invite/${code}`, { method: "POST", redirect: "manual" });

describe("the invites command", () => {
  it("wants the server's database", () => {
    dbPath = join(tmpdir(), "mm-no-such-dir", "manors.sqlite");
    const result = run("list");
    expect(result.status).toBe(1);
    expect(result.err).toMatch(/No database at .*DB_PATH/);
  });

  it("makes a personal link the running server accepts", async () => {
    await startServer();
    const made = run("create", "Anna", "Berg");
    expect(made.status).toBe(0);
    expect(made.out).toMatch(/^Invite for Anna Berg \(id \w+\): any number of devices, no expiry, 10 invites of their own\.$/m);
    expect(made.out).toMatch(/^https:\/\/play\.example\.org\/invite\/[a-z0-9]{12}$/m);
    expect((await accept(codeIn(made.out))).status).toBe(303);

    const listed = run("list");
    expect(listed.out).toContain("Anna Berg, invited by you, active");
    expect(listed.out).toContain("1 device (any number allowed), 0 of 10 invites made");
    expect(listed.out).toContain(`${PUBLIC_URL}/invite/${codeIn(made.out)}`);
  });

  it("makes single-use, expiring links and sets how many invites their holder may make", async () => {
    await startServer();
    const made = run("create", "Cleo", "--uses", "1", "--days=7", "--invites", "0");
    expect(made.out).toMatch(/one device, link open until \d{4}-\d\d-\d\d, 0 invites of their own/);
    const code = codeIn(made.out);
    expect((await accept(code)).status).toBe(303);
    expect((await accept(code)).status).toBe(410);
    expect(run("list").out).toMatch(/Cleo, invited by you, active, link used up\n {2}1 device \(1 allowed\), 0 of 0 invites made/);
  });

  it("shows who invited whom and the players each invite let in", async () => {
    await startServer();
    const anna = codeIn(run("create", "Anna").out);
    const guest = await fetch(`${base}/api/guest`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: "Annie", inviteCode: anna }) });
    expect(guest.status).toBe(200);
    const { token } = (await guest.json()) as { token: string };
    const made = await fetch(`${base}/api/invites`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "Bert" }) });
    expect(made.status).toBe(200);
    const listed = run("list").out;
    // Accepting an invite names the player after it, whatever they typed.
    expect(listed).toContain("players: Anna");
    expect(listed).toContain("1 of 10 invites made");
    expect(listed).toMatch(/Bert, invited by Anna, active\n {2}0 devices \(3 allowed\)/);
  });

  it("revokes one invite by its id", async () => {
    await startServer();
    const made = run("create", "Emil").out;
    const id = /\(id (\w+)\)/.exec(made)?.[1] ?? "";
    const other = codeIn(run("create", "Fritz").out);
    expect((await accept(codeIn(made))).status).toBe(303);

    const revoked = run("revoke", id);
    expect(revoked.status).toBe(0);
    expect(revoked.out).toBe(`Revoked Emil's invite (${id}): its 1 device and 0 players are shut out.`);
    expect(run("revoke", id).out).toMatch(/already revoked/);
    expect(run("list").out).toContain("Emil, invited by you, revoked");
    expect((await accept(codeIn(made))).status).toBe(410);
    expect((await accept(other)).status).toBe(303);

    const unknown = run("revoke", "nosuch");
    expect(unknown.status).toBe(1);
    expect(unknown.err).toMatch(/No invite nosuch/);
  });

  it("explains its usage when an argument is wrong", async () => {
    await startServer();
    for (const args of [["create"], ["create", "Anna", "--uses", "0"], ["create", "Anna", "--days", "soon"], ["create", "Anna", "--days", "999999999"], ["create", "Anna", "--colour", "red"], ["create", "Anna", "--uses"], ["revoke"], ["frobnicate"]]) {
      const result = run(...args);
      expect(result.status, args.join(" ")).toBe(1);
      expect(result.err, args.join(" ")).toContain("Usage:");
    }
    expect(run("list").out).toMatch(/No invites yet/);
    expect(run("help").status).toBe(0);
  });
});
