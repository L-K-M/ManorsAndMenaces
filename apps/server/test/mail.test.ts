import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isEmailAddress, mailConfigFromEnv } from "../src/mail.js";

describe("mail configuration", () => {
  const complete = { MAIL_FROM: "Manors <turns@example.org>", PUBLIC_URL: "https://play.example.org/" };

  it("leaves email off when no way to send it is set", () => {
    expect(mailConfigFromEnv({})).toBeNull();
    expect(mailConfigFromEnv(complete)).toBeNull();
  });

  it("names what is missing or wrong", () => {
    expect(() => mailConfigFromEnv({ SMTP_URL: "smtps://u:p@smtp.example.org" })).toThrow(/MAIL_FROM.*PUBLIC_URL|PUBLIC_URL.*MAIL_FROM/);
    expect(() => mailConfigFromEnv({ ...complete, SMTP_URL: "smtps://u:p@smtp.example.org", PUBLIC_URL: "play.example.org" })).toThrow(/PUBLIC_URL/);
    expect(() => mailConfigFromEnv({ ...complete, SMTP_URL: "http://smtp.example.org" })).toThrow(/SMTP_URL/);
    expect(() => mailConfigFromEnv({ ...complete, SMTP_URL: "smtps://u:p@smtp.example.org", MAIL_OUTBOX_DIR: "/tmp/x" })).toThrow(/not both/);
  });

  it("builds links from the public address without a trailing slash", () => {
    expect(mailConfigFromEnv({ ...complete, SMTP_URL: "smtp://u:p@smtp.example.org:587" })).toMatchObject({ from: complete.MAIL_FROM, publicUrl: "https://play.example.org" });
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

/** The least of an SMTP server (RFC 5321): no TLS, no login; records each message. */
async function fakeSmtpServer() {
  const received: { from: string; to: string[]; data: string }[] = [];
  const server = createServer((socket) => {
    let mail = { from: "", to: [] as string[], data: "" };
    let inData = false;
    let buffered = "";
    socket.write("220 fake ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffered += chunk.toString("utf8");
      let end: number;
      while ((end = buffered.indexOf("\r\n")) >= 0) {
        const line = buffered.slice(0, end);
        buffered = buffered.slice(end + 2);
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
        } else if (/^QUIT/i.test(line)) socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n"); // EHLO, RSET, NOOP
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { received, port: (server.address() as AddressInfo).port, close: () => new Promise((r) => server.close(r)) };
}

describe("sending over SMTP", () => {
  const env = { MAIL_FROM: "Manors <turns@example.org>", PUBLIC_URL: "https://play.example.org" };

  it("hands the message to the SMTP server named by SMTP_URL", async () => {
    const smtp = await fakeSmtpServer();
    const config = mailConfigFromEnv({ ...env, SMTP_URL: `smtp://127.0.0.1:${smtp.port}` })!;
    await expect(config.verify!()).resolves.toBe(true);
    await config.transport({ from: env.MAIL_FROM, to: "ann@example.org", subject: "Your turn", text: "Your move.", headers: {} });
    expect(smtp.received).toHaveLength(1);
    expect(smtp.received[0]).toMatchObject({ from: "<turns@example.org>", to: ["<ann@example.org>"] });
    expect(smtp.received[0]!.data).toMatch(/^Subject: Your turn$/m);
    await smtp.close();
  });

  it("fails, rather than waiting, when nothing answers", async () => {
    const smtp = await fakeSmtpServer();
    await smtp.close();
    const config = mailConfigFromEnv({ ...env, SMTP_URL: `smtp://127.0.0.1:${smtp.port}` })!;
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
