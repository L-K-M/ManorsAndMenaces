// Turn notices by email (spec §85) for players who asked for them in the
// lobby and confirmed their address. Like Web Push, a notice goes out only
// while the player has no app open (app.ts). The server sends through SMTP
// (SMTP_URL); for development, MAIL_OUTBOX_DIR writes each message to a file
// instead. Links point at PUBLIC_URL, where players open the game, so the
// server there must also serve the web client (WEB_DIST).

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTransport } from "nodemailer";
import type { EmailSettings, MatchNotice } from "@manors-menaces/protocol";
import { text } from "./notices.js";
import { HttpError, hashToken } from "./service.js";
import type { Store } from "./store.js";

export interface Mail {
  from: string;
  to: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
}

/** Hands a message to the mail system; rejects when it was not accepted. */
export type MailTransport = (mail: Mail) => Promise<void>;

export interface MailConfig {
  /** The From header, e.g. `Manors & Menaces <turns@example.org>`. */
  from: string;
  /** Where players open the game, without a trailing slash. */
  publicUrl: string;
  transport: MailTransport;
  /** Checks that the SMTP server can be reached and accepts the login. */
  verify?: () => Promise<unknown>;
}

/** How long a confirmation link works. */
const CONFIRM_LINK_MS = 24 * 3600_000;
const DAY_MS = 24 * 3600_000;
// Confirmation emails go to addresses nobody has vouched for yet, so they are
// capped per address (stopping many throwaway guests from mailing one person)
// and per guest (stopping one guest from mailing many people).
const CONFIRMATIONS_PER_ADDRESS_PER_DAY = 3;
const CONFIRMATIONS_PER_GUEST_PER_DAY = 5;

/**
 * The mailbox an address delivers to, for the per-address limit: most large
 * providers deliver "name+tag@host" to "name@host", so every alias must share
 * one allowance, or a string of aliases floods one inbox.
 */
function mailboxKey(address: string): string {
  return address.toLowerCase().replace(/\+[^@]*@/, "@");
}
// SMTP servers that hang must not hold a lobby request for minutes
// (nodemailer waits up to two minutes to connect by default).
const SMTP_TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

const MAX_ADDRESS_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;
// Deliberately narrow: one plain address without a display name, quotes,
// comments or whitespace, so nothing but the address reaches a mail header.
const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

export function isEmailAddress(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_ADDRESS_LENGTH) return false;
  const at = value.indexOf("@");
  return at > 0 && at <= MAX_LOCAL_PART_LENGTH && ADDRESS.test(value);
}

/**
 * Email settings from the environment: null when neither SMTP_URL nor
 * MAIL_OUTBOX_DIR is set. Throws a message naming the setting to fix.
 */
export function mailConfigFromEnv(env: Record<string, string | undefined>): MailConfig | null {
  const smtp = env.SMTP_URL?.trim();
  const outbox = env.MAIL_OUTBOX_DIR?.trim();
  if (!smtp && !outbox) return null;
  if (smtp && outbox) throw new Error("Set SMTP_URL or MAIL_OUTBOX_DIR, not both");
  const missing = ["MAIL_FROM", "PUBLIC_URL"].filter((name) => !env[name]?.trim());
  if (missing.length > 0) throw new Error(`Email needs ${missing.join(" and ")} as well as ${smtp ? "SMTP_URL" : "MAIL_OUTBOX_DIR"}`);

  const publicUrl = parseUrl(env.PUBLIC_URL as string);
  if (!publicUrl || !/^https?:$/.test(publicUrl.protocol) || publicUrl.search || publicUrl.hash) {
    throw new Error(`PUBLIC_URL must be the http(s) address players open the game at, like https://play.example.org, not "${env.PUBLIC_URL}"`);
  }
  const from = (env.MAIL_FROM as string).trim();
  // Every email carries it as a header, so a stray line break would corrupt them all.
  if (/[\r\n]/.test(from)) throw new Error("MAIL_FROM must be one line, like: Manors & Menaces <turns@example.org>");
  const base = publicUrl.href.replace(/\/+$/, "");
  if (outbox) return { from, publicUrl: base, transport: outboxTransport(outbox) };

  // The URL carries the password: never echo it.
  if (!/^smtps?:$/.test(parseUrl(smtp as string)?.protocol ?? "")) throw new Error("SMTP_URL must start with smtp:// (STARTTLS, usually port 587) or smtps:// (TLS, usually port 465)");
  const transporter = createTransport({ url: smtp, ...SMTP_TIMEOUTS });
  return {
    from,
    publicUrl: base,
    transport: async (mail) => void (await transporter.sendMail(mail)),
    verify: () => transporter.verify(),
  };
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

/** Writes each message to `dir` as an .eml file (development: nothing leaves the machine). */
function outboxTransport(dir: string): MailTransport {
  const transporter = createTransport({ streamTransport: true, buffer: true, newline: "unix" });
  return async (mail) => {
    const info = await transporter.sendMail(mail);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${Date.now()}-${randomBytes(4).toString("hex")}.eml`), info.message as Buffer);
  };
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Turn emails for the guests of one server. */
export class EmailNotices {
  /**
   * When recent confirmation emails went out, per `address:` and `guest:` key.
   * Kept in memory, so a restart resets the daily limits; they exist to stop
   * floods, which a restart now and then does not re-enable.
   */
  private readonly confirmationsSent = new Map<string, number[]>();

  constructor(
    private readonly store: Store,
    private readonly config: MailConfig,
    /** Signs unsubscribe links, which must keep working without a stored token. */
    private readonly secret: string,
  ) {}

  get publicUrl(): string {
    return this.config.publicUrl;
  }

  settings(userId: string): EmailSettings {
    const row = this.store.emailAddress(userId);
    return { available: true, address: row?.address ?? null, confirmed: !!row?.confirmed_at };
  }

  /**
   * Emails `input` a confirmation link. The address gets turn notices only
   * once that link's button is pressed, so nobody can sign up someone else.
   * A new address replaces the guest's previous one at once.
   */
  async request(userId: string, input: unknown): Promise<EmailSettings> {
    const address = typeof input === "string" ? input.trim() : input;
    if (!isEmailAddress(address)) throw new HttpError(400, "that is not an email address");
    const current = this.store.emailAddress(userId);
    if (current?.confirmed_at && current.address.toLowerCase() === address.toLowerCase()) return this.settings(userId);

    const now = Date.now();
    const keys = [`address:${mailboxKey(address)}`, `guest:${userId}`];
    const limits = [CONFIRMATIONS_PER_ADDRESS_PER_DAY, CONFIRMATIONS_PER_GUEST_PER_DAY];
    if (keys.some((key, i) => this.recent(key, now).length >= (limits[i] as number))) throw new HttpError(429, "too many confirmation emails today; try again tomorrow");
    // Failed sends count too, so a broken mail server is not hammered.
    for (const key of keys) this.confirmationsSent.set(key, [...this.recent(key, now), now]);

    const token = randomBytes(32).toString("base64url");
    const link = `${this.config.publicUrl}/api/email/confirm?t=${token}`;
    try {
      await this.config.transport({
        from: this.config.from,
        to: address,
        subject: text("email.confirm_subject"),
        text: text("email.confirm_text", { address, link }),
        headers: { "Auto-Submitted": "auto-generated" },
      });
    } catch (e) {
      console.error(`confirmation email failed: ${message(e)}`);
      throw new HttpError(502, "the confirmation email could not be sent; try again later");
    }
    this.store.requestEmail(userId, address, hashToken(token));
    return this.settings(userId);
  }

  /** The address a confirmation link asks about, while the link works. */
  pending(token: string): string | null {
    return this.store.pendingEmail(hashToken(token), this.confirmCutoff())?.address ?? null;
  }

  /** Confirms the address a link was sent to; null if the link is unknown, used or expired. */
  confirm(token: string): string | null {
    return this.store.confirmEmail(hashToken(token), this.confirmCutoff())?.address ?? null;
  }

  remove(userId: string): void {
    this.store.removeEmail(userId);
  }

  /** Whether an unsubscribe link is genuine: it carries the guest id and this server's signature of it. */
  canUnsubscribe(userId: string, token: string): boolean {
    const expected = Buffer.from(this.unsubscribeToken(userId));
    const given = Buffer.from(token);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  /** Emails a notice to the guest, if they confirmed an address. Never throws. */
  notify(userId: string, notice: MatchNotice): void {
    const row = this.store.emailAddress(userId);
    if (!row?.confirmed_at) return;
    const unsubscribe = `${this.config.publicUrl}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${this.unsubscribeToken(userId)}`;
    const mail: Mail = {
      from: this.config.from,
      to: row.address,
      subject: text("email.notice_subject", { title: notice.title }),
      text: text("email.notice_text", { body: notice.body, link: `${this.config.publicUrl}/#/match/${notice.matchId}`, unsubscribe }),
      headers: {
        // RFC 8058: mail clients offer their own "Unsubscribe" that POSTs here.
        "List-Unsubscribe": `<${unsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        // RFC 3834: no vacation auto-replies to the server.
        "Auto-Submitted": "auto-generated",
      },
    };
    // Nothing here may reject unhandled: main.ts exits on that.
    this.config.transport(mail).catch((e: unknown) => console.error(`turn email failed: ${message(e)}`));
  }

  /** Forgets confirmation counts older than a day. */
  sweep(now = Date.now()): void {
    for (const key of [...this.confirmationsSent.keys()]) {
      const recent = this.recent(key, now);
      if (recent.length === 0) this.confirmationsSent.delete(key);
      else this.confirmationsSent.set(key, recent);
    }
  }

  private recent(key: string, now: number): number[] {
    return (this.confirmationsSent.get(key) ?? []).filter((at) => at > now - DAY_MS);
  }

  private confirmCutoff(): string {
    return new Date(Date.now() - CONFIRM_LINK_MS).toISOString();
  }

  private unsubscribeToken(userId: string): string {
    return createHmac("sha256", this.secret).update(`unsubscribe:${userId}`).digest("base64url");
  }
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The page an email link opens. A link only ever shows a question and a
 * button: mail scanners open links to check them, and must not confirm or
 * unsubscribe anyone by doing so. The button posts back to the same address.
 */
export function emailPage(publicUrl: string, title: string, body: string, button?: string): string {
  const form = button ? `<form method="post"><button>${escapeHtml(button)}</button></form>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 17px/1.5 Georgia, serif; background: #efe4c8; color: #2b2116; }
main { max-width: 30rem; margin: 1rem; padding: 1.4rem 1.6rem; background: #fbf5e6; border: 3px solid #8a7650; border-radius: 16px; }
h1 { margin-top: 0; font-size: 1.4rem; }
button { font: inherit; padding: 0.5rem 1.2rem; border-radius: 10px; border: 2px solid #5b4a2c; background: #7a5a2e; color: #fff; cursor: pointer; }
a { color: #5b3f12; }
</style>
</head>
<body>
<main>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>
${form}
<p><a href="${escapeHtml(publicUrl)}/">${escapeHtml(text("email.page_open_game"))}</a></p>
</main>
</body>
</html>
`;
}
