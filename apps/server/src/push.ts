// Web Push (RFC 8030) for players whose app is closed: message encryption
// (RFC 8291, "aes128gcm") and server identification (VAPID, RFC 8292), built
// on node:crypto. The service worker shows what arrives (sw.template.js).

import { createCipheriv, createECDH, createPrivateKey, createPublicKey, generateKeyPairSync, hkdfSync, randomBytes, sign, type KeyObject } from "node:crypto";

/** A browser's subscription as stored: keys base64url, as the browser gives them. */
export interface StoredSubscription {
  endpoint: string;
  /** The browser's P-256 public key, uncompressed (65 bytes). */
  p256dh: string;
  /** The browser's authentication secret (16 bytes). */
  auth: string;
}

export interface VapidKeys {
  /** Uncompressed P-256 point, base64url: the browser's `applicationServerKey`. */
  publicKey: string;
  privateKey: KeyObject;
}

/**
 * The push services browsers subscribe with (Chrome and Edge's FCM,
 * Firefox, Safari, Windows). The server POSTs to a subscription's endpoint,
 * so accepting any host would let a client aim those requests anywhere.
 */
const PUSH_SERVICE_DOMAINS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

const MAX_ENDPOINT_LENGTH = 1024;
/** RFC 8188 record size; one record holds any notice. */
const RECORD_SIZE = 4096;

export function isPushServiceHost(host: string): boolean {
  return PUSH_SERVICE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

/** A subscription from an untrusted client, or null if it is not one we can deliver to. */
export function parseSubscription(x: unknown, allowHost: (host: string) => boolean = isPushServiceHost): StoredSubscription | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const { endpoint, keys } = x as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || !allowHost(url.hostname)) return null;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
  const p256dh = Buffer.from(keys.p256dh, "base64url");
  if (p256dh.length !== 65 || p256dh[0] !== 0x04 || Buffer.from(keys.auth, "base64url").length !== 16) return null;
  return { endpoint, p256dh: keys.p256dh, auth: keys.auth };
}

/**
 * One aes128gcm record for the browser (RFC 8291 section 3.4): keys derived
 * from an ECDH exchange with a fresh sender key pair and the browser's
 * authentication secret. `opts` fixes the salt and sender key for tests.
 */
export function encryptPayload(plaintext: Buffer, keys: { p256dh: string; auth: string }, opts: { salt?: Buffer; senderPrivateKey?: Buffer } = {}): Buffer {
  const uaPublic = Buffer.from(keys.p256dh, "base64url");
  const authSecret = Buffer.from(keys.auth, "base64url");
  const sender = createECDH("prime256v1");
  if (opts.senderPrivateKey) sender.setPrivateKey(opts.senderPrivateKey);
  else sender.generateKeys();
  const asPublic = sender.getPublicKey();
  const ecdhSecret = sender.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", ecdhSecret, authSecret, keyInfo, 32));
  const salt = opts.salt ?? randomBytes(16);
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // 0x02 marks the last (only) record.
  const ciphertext = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, ciphertext]);
}

/** A new VAPID key pair as PKCS#8 PEM, for storing. */
export function generateVapidKeys(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return privateKey.export({ format: "pem", type: "pkcs8" }).toString();
}

export function vapidKeysFromPem(pem: string): VapidKeys {
  const privateKey = createPrivateKey(pem);
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  const point = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x as string, "base64url"), Buffer.from(jwk.y as string, "base64url")]);
  return { publicKey: point.toString("base64url"), privateKey };
}

/** The Authorization header identifying this server to the push service (RFC 8292). */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): string {
  const part = (x: object) => Buffer.from(JSON.stringify(x)).toString("base64url");
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key: keys.privateKey, dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${signature.toString("base64url")}, k=${keys.publicKey}`;
}

export type PushResult = "sent" | "gone" | "failed";

/** Delivers one notice; "gone" means the browser unsubscribed and the subscription can be dropped. */
export async function sendPush(
  sub: StoredSubscription,
  payload: object,
  vapid: { keys: VapidKeys; subject: string },
  fetchFn: typeof fetch = fetch,
): Promise<PushResult> {
  const res = await fetchFn(sub.endpoint, {
    method: "POST",
    headers: {
      // Kept for a day: a turn notice is still worth reading the next morning.
      TTL: "86400",
      Urgency: "normal",
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      Authorization: vapidAuthorization(sub.endpoint, vapid.keys, vapid.subject),
    },
    body: encryptPayload(Buffer.from(JSON.stringify(payload)), sub),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404 || res.status === 410) return "gone";
  return res.ok ? "sent" : "failed";
}
