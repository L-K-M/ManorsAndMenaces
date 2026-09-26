import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Where the e2e game server writes its emails instead of sending them (MAIL_OUTBOX_DIR). */
export const OUTBOX = join(tmpdir(), "manors-menaces-e2e-outbox");

/**
 * An .eml file with its headers unfolded and, when it says so, its
 * quoted-printable body decoded (as UTF-8): enough to read links. Headers are
 * never decoded, as they carry raw query strings ("t=9f..." is not a byte).
 */
export function readable(raw: string): string {
  const split = raw.match(/\r?\n\r?\n/);
  if (!split || split.index === undefined) return raw.replace(/\r?\n(?=[ \t])/g, "");
  const headers = raw.slice(0, split.index).replace(/\r?\n(?=[ \t])/g, "");
  const body = raw.slice(split.index + split[0].length);
  if (!/^Content-Transfer-Encoding:\s*quoted-printable\s*$/im.test(headers)) return headers + split[0] + body;
  const bytes = body.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return headers + split[0] + Buffer.from(bytes, "latin1").toString("utf8");
}

/** The newest email to `address` whose text matches `pattern`, waiting for it to be written. */
export async function mailTo(address: string, pattern: RegExp, timeoutMs = 15_000): Promise<string> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const files = existsSync(OUTBOX) ? readdirSync(OUTBOX).sort().reverse() : [];
    for (const file of files) {
      const mail = readable(readFileSync(join(OUTBOX, file), "utf8"));
      if (new RegExp(`^To: ${address.replace(/[.+]/g, "\\$&")}$`, "m").test(mail) && pattern.test(mail)) return mail;
    }
    if (Date.now() > end) throw new Error(`no email to ${address} matching ${pattern} in ${OUTBOX}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** The first link in `mail` whose path starts with `path`. */
export function linkIn(mail: string, path: string): string {
  const found = mail.match(new RegExp(`https?://[^\\s/]+${path.replace(/[/?]/g, "\\$&")}[^\\s>]*`));
  if (!found) throw new Error(`no ${path} link in the email`);
  return found[0];
}
