import { createECDH, createDecipheriv, createPublicKey, hkdfSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encryptPayload, generateVapidKeys, isPushServiceHost, parseSubscription, vapidAuthorization, vapidKeysFromPem } from "../src/push.js";

// Web Push (RFC 8030) messages are encrypted for the browser (RFC 8291) and
// signed by the server (VAPID, RFC 8292); the push service rejects anything
// else, so both are checked against the RFCs rather than against ourselves.

const b64 = (s: string) => Buffer.from(s.replace(/\s+/g, ""), "base64url");

// RFC 8291, section 5 and Appendix A.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  body: `DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml
         mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT
         pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN`,
};

/** What a browser does with a push message (RFC 8291 section 3.4, receiver side). */
function decrypt(body: Buffer, uaPrivate: Buffer, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  const idLength = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idLength);
  const ciphertext = body.subarray(21 + idLength);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivate);
  const uaPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(asPublic);
  const ikm = Buffer.from(hkdfSync("sha256", secret, auth, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const padded = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  expect(padded.at(-1)).toBe(2); // the last-record delimiter
  return padded.subarray(0, -1).toString("utf8");
}

describe("push message encryption", () => {
  it("produces RFC 8291's example message from its keys and salt", () => {
    const body = encryptPayload(Buffer.from(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, { salt: b64(RFC.salt), senderPrivateKey: b64(RFC.asPrivate) });
    expect(body.toString("base64url")).toBe(RFC.body.replace(/\s+/g, ""));
  });

  it("uses fresh keys and salt for every message, which the browser can still decrypt", () => {
    const keys = { p256dh: RFC.uaPublic, auth: RFC.auth };
    const a = encryptPayload(Buffer.from("hello"), keys);
    const b = encryptPayload(Buffer.from("hello"), keys);
    expect(a.equals(b)).toBe(false);
    expect(decrypt(a, b64(RFC.uaPrivate), b64(RFC.auth))).toBe("hello");
  });
});

describe("VAPID", () => {
  it("signs a token the push service can verify with the public key", () => {
    const keys = vapidKeysFromPem(generateVapidKeys());
    const now = Date.UTC(2026, 8, 25, 12);
    const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", keys, "mailto:ops@example.org", now);
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, head, claims, signature, k] = match as unknown as string[];
    expect(JSON.parse(b64(head as string).toString())).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(b64(claims as string).toString())).toEqual({ aud: "https://fcm.googleapis.com", exp: now / 1000 + 12 * 3600, sub: "mailto:ops@example.org" });
    // `k` is the uncompressed P-256 point the browser subscribed with.
    expect(k).toBe(keys.publicKey);
    expect(b64(k as string)).toHaveLength(65);
    const publicKey = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64(k as string).subarray(1, 33).toString("base64url"), y: b64(k as string).subarray(33).toString("base64url") }, format: "jwk" });
    expect(verify("sha256", Buffer.from(`${head}.${claims}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, b64(signature as string))).toBe(true);
  });
});

describe("push subscriptions", () => {
  const good = { endpoint: "https://fcm.googleapis.com/fcm/send/abc:def", keys: { p256dh: RFC.uaPublic, auth: RFC.auth } };

  it("accepts a browser's subscription to a known push service", () => {
    expect(parseSubscription(good)).toEqual({ endpoint: good.endpoint, p256dh: RFC.uaPublic, auth: RFC.auth });
    for (const host of ["updates.push.services.mozilla.com", "web.push.apple.com", "wns2-par02p.notify.windows.com"]) {
      expect(isPushServiceHost(host)).toBe(true);
    }
  });

  it("refuses anything that would make the server post elsewhere or cannot be encrypted for", () => {
    const bad: unknown[] = [
      null,
      "https://fcm.googleapis.com/x",
      { ...good, endpoint: "http://fcm.googleapis.com/fcm/send/abc" },
      { ...good, endpoint: "https://127.0.0.1/push" },
      { ...good, endpoint: "https://fcm.googleapis.com.evil.example/push" },
      { ...good, endpoint: "https://evilfcm.googleapis.com.example/push" },
      { ...good, endpoint: "https://user:pw@fcm.googleapis.com/push" },
      { ...good, endpoint: `https://fcm.googleapis.com/${"x".repeat(2000)}` },
      { ...good, keys: { p256dh: RFC.auth, auth: RFC.auth } },
      { ...good, keys: { p256dh: RFC.uaPublic, auth: RFC.uaPublic } },
      { ...good, keys: undefined },
    ];
    for (const x of bad) expect(parseSubscription(x), JSON.stringify(x)).toBeNull();
    expect(isPushServiceHost("notify.windows.com.example")).toBe(false);
  });
});
