import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isEmailAddress, mailConfigFromEnv, smtpOptionsFromEnv } from "../src/mail.js";

describe("mail configuration", () => {
  const complete = { MAIL_FROM: "Manors <turns@example.org>", PUBLIC_URL: "https://play.example.org/" };
  const host = { SMTP_HOST: "smtp.example.org" };

  it("leaves email off when no way to send it is set", () => {
    expect(mailConfigFromEnv({})).toBeNull();
    expect(mailConfigFromEnv(complete)).toBeNull();
    // Docker Compose passes every setting, empty when it is not set, and
    // .env.example spells out the default port.
    expect(mailConfigFromEnv({ ...complete, SMTP_HOST: "", SMTP_PORT: "", SMTP_USER: "", SMTP_PASSWORD: "", MAIL_OUTBOX_DIR: "" })).toBeNull();
    expect(mailConfigFromEnv({ SMTP_HOST: "", SMTP_PORT: "587" })).toBeNull();
  });

  it("names what is missing or wrong", () => {
    expect(() => mailConfigFromEnv(host)).toThrow(/MAIL_FROM.*PUBLIC_URL|PUBLIC_URL.*MAIL_FROM/);
    expect(() => mailConfigFromEnv({ ...complete, ...host, PUBLIC_URL: "play.example.org" })).toThrow(/PUBLIC_URL/);
    expect(() => mailConfigFromEnv({ ...complete, ...host, MAIL_OUTBOX_DIR: "/tmp/x" })).toThrow(/not both/);
    // Every email carries it as a header, so a stray line break would corrupt them all.
    expect(() => mailConfigFromEnv({ ...complete, ...host, MAIL_FROM: "Turns <turns@example.org>\nBcc: x@example.org" })).toThrow(/MAIL_FROM/);
    for (const bad of ["smtps://smtp.example.org", "smtp.example.org:465", "smtp example.org", "smtp.example.org/"]) {
      expect(() => mailConfigFromEnv({ ...complete, SMTP_HOST: bad }), bad).toThrow(/SMTP_HOST/);
    }
    for (const bad of ["0", "65536", "587x", "-1", "5.5"]) {
      expect(() => mailConfigFromEnv({ ...complete, ...host, SMTP_PORT: bad }), bad).toThrow(/SMTP_PORT/);
    }
    expect(() => mailConfigFromEnv({ ...complete, ...host, SMTP_USER: "turns@example.org" })).toThrow(/SMTP_PASSWORD/);
    expect(() => mailConfigFromEnv({ ...complete, ...host, SMTP_PASSWORD: "secret" })).toThrow(/SMTP_USER/);
    // A login for a mail server nobody named.
    expect(() => mailConfigFromEnv({ ...complete, SMTP_USER: "turns@example.org", SMTP_PASSWORD: "secret" })).toThrow(/SMTP_HOST/);
  });

  it("says what replaced SMTP_URL", () => {
    expect(() => mailConfigFromEnv({ ...complete, SMTP_URL: "smtps://u:p@smtp.example.org" })).toThrow(/SMTP_URL.*SMTP_HOST/);
  });

  it("connects with TLS on port 465, and on other ports upgrades when the server offers STARTTLS", () => {
    expect(smtpOptionsFromEnv({})).toBeNull();
    expect(smtpOptionsFromEnv(host)).toEqual(expect.objectContaining({ host: "smtp.example.org", port: 587, secure: false }));
    expect(smtpOptionsFromEnv(host)).not.toHaveProperty("auth");
    expect(smtpOptionsFromEnv({ ...host, SMTP_PORT: "465" })).toMatchObject({ port: 465, secure: true });
    expect(smtpOptionsFromEnv({ ...host, SMTP_PORT: " 2525 " })).toMatchObject({ port: 2525, secure: false });
  });

  it("takes the user name and password as they are, with nothing to encode", () => {
    const login = { SMTP_USER: "turns@example.org", SMTP_PASSWORD: " p@ss:w/rd%41 #$'" };
    expect(smtpOptionsFromEnv({ ...host, ...login })).toMatchObject({ auth: { user: "turns@example.org", pass: " p@ss:w/rd%41 #$'" } });
  });

  it("builds links from the public address without a trailing slash", () => {
    expect(mailConfigFromEnv({ ...complete, ...host })).toMatchObject({ from: complete.MAIL_FROM, publicUrl: "https://play.example.org" });
  });

  it("writes each message to the outbox directory instead of sending it (development)", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "mm-outbox-")), "mail");
    const config = mailConfigFromEnv({ ...complete, MAIL_OUTBOX_DIR: dir });
    await config!.transport({ from: complete.MAIL_FROM, to: "ann@example.org", subject: "Your turn · Manors & Menaces", text: "Line one\nhttps://play.example.org/#/match/m_1", headers: { "List-Unsubscribe": "<https://play.example.org/api/email/unsubscribe?u=u_1&t=x>" } });
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/\.eml$/);
    // Long headers fold onto continuation lines (RFC 5322 section 2.2.3).
    const raw = readFileSync(join(dir, files[0]!), "utf8").replace(/\r?\n(?=[ \t])/g, "");
    expect(raw).toMatch(/^To: ann@example\.org$/m);
    expect(raw).toMatch(/^List-Unsubscribe: <https:\/\/play\.example\.org\/api\/email\/unsubscribe\?u=u_1&t=x>$/m);
    expect(raw).toContain("https://play.example.org/#/match/m_1");
  });
});

/** The least of an SMTP server (RFC 5321, AUTH PLAIN of RFC 4616): no TLS; records each login and message. */
async function fakeSmtpServer() {
  const received: { from: string; to: string[]; data: string }[] = [];
  const logins: { user: string; pass: string }[] = [];
  const server = createServer((socket) => {
    let mail = { from: "", to: [] as string[], data: "" };
    let inData = false;
    // Bytes, not text, until a line is complete: a chunk may end mid-character.
    let buffered = Buffer.alloc(0);
    socket.write("220 fake ESMTP\r\n");
    socket.on("data", (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      let end: number;
      while ((end = buffered.indexOf("\r\n")) >= 0) {
        const line = buffered.subarray(0, end).toString("utf8");
        buffered = buffered.subarray(end + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            received.push(mail);
            mail = { from: "", to: [], data: "" };
            socket.write("250 queued\r\n");
          } else mail.data += `${line.replace(/^\./, "")}\n`;
        } else if (/^MAIL FROM:/i.test(line)) {
          mail.from = line.slice(10);
          socket.write("250 ok\r\n");
        } else if (/^RCPT TO:/i.test(line)) {
          mail.to.push(line.slice(8));
          socket.write("250 ok\r\n");
        } else if (/^DATA/i.test(line)) {
          inData = true;
          socket.write("354 go ahead\r\n");
        } else if (/^EHLO/i.test(line)) {
          // Nodemailer logs in only to a server that offers it.
          socket.write("250-fake\r\n250 AUTH PLAIN\r\n");
        } else if (/^AUTH PLAIN /i.test(line)) {
          const [, user = "", pass = ""] = Buffer.from(line.slice(11), "base64").toString("utf8").split("\0");
          logins.push({ user, pass });
          socket.write("235 authenticated\r\n");
        } else if (/^QUIT/i.test(line)) socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n"); // RSET, NOOP
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { received, logins, port: (server.address() as AddressInfo).port, close: () => new Promise((r) => server.close(r)) };
}

describe("sending over SMTP", () => {
  const env = { MAIL_FROM: "Manors <turns@example.org>", PUBLIC_URL: "https://play.example.org" };

  it("hands the message to the SMTP server named by SMTP_HOST and SMTP_PORT", async () => {
    const smtp = await fakeSmtpServer();
    const config = mailConfigFromEnv({ ...env, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtp.port) })!;
    await expect(config.verify!()).resolves.toBe(true);
    await config.transport({ from: env.MAIL_FROM, to: "ann@example.org", subject: "Your turn", text: "Your move.", headers: {} });
    expect(smtp.received).toHaveLength(1);
    expect(smtp.received[0]).toMatchObject({ from: "<turns@example.org>", to: ["<ann@example.org>"] });
    expect(smtp.received[0]!.data).toMatch(/^Subject: Your turn$/m);
    expect(smtp.logins).toEqual([]);
    await smtp.close();
  });

  it("logs in with SMTP_USER and SMTP_PASSWORD exactly as set", async () => {
    const smtp = await fakeSmtpServer();
    const config = mailConfigFromEnv({ ...env, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtp.port), SMTP_USER: "turns@example.org", SMTP_PASSWORD: "p@ss:w/rd%41" })!;
    await config.transport({ from: env.MAIL_FROM, to: "ann@example.org", subject: "Your turn", text: "Your move.", headers: {} });
    expect(smtp.logins).toEqual([{ user: "turns@example.org", pass: "p@ss:w/rd%41" }]);
    expect(smtp.received).toHaveLength(1);
    await smtp.close();
  });

  it("fails, rather than waiting, when nothing answers", async () => {
    const smtp = await fakeSmtpServer();
    await smtp.close();
    const config = mailConfigFromEnv({ ...env, SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtp.port) })!;
    await expect(config.verify!()).rejects.toThrow();
    await expect(config.transport({ from: env.MAIL_FROM, to: "ann@example.org", subject: "x", text: "x", headers: {} })).rejects.toThrow();
  });
});

describe("isEmailAddress", () => {
  it("takes plain addresses and nothing that could smuggle in headers or more recipients", () => {
    for (const ok of ["ann@example.org", "ann.lee+games@mail.example.co.uk", "A@B.CD"]) expect(isEmailAddress(ok), ok).toBe(true);
    for (const bad of ["", "ann", "ann@example", "ann@@example.org", "ann@example.org\n", "ann@exa mple.org", "Ann <ann@example.org>", "ann@example.org,bob@example.org", "ann@example.org;", `${"a".repeat(65)}@example.org`, `ann@${"e".repeat(250)}.org`, 5, null]) {
      expect(isEmailAddress(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});
