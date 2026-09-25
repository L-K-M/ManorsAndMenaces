// Web Push for turn notices while the app is closed (spec §85): subscribes
// this browser with the server's VAPID key. It needs the service worker,
// which only production web builds register (pwa.svelte.ts), so in the dev
// server and the desktop app notices arrive only while the app is open.

import type { PushSubscriptionRequest } from "@manors-menaces/protocol";
import type { OnlineClient } from "./client.js";

export type PushState = "unsupported" | "off" | "on" | "denied";

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || typeof PushManager === "undefined" || typeof Notification === "undefined") return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

function bytes(base64url: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64url.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function sameKey(key: ArrayBuffer | null, base64url: string): boolean {
  if (!key) return false;
  const a = new Uint8Array(key);
  const b = bytes(base64url);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export async function pushState(): Promise<PushState> {
  const reg = await registration();
  if (!reg) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && (await reg.pushManager.getSubscription()) ? "on" : "off";
}

/** Asks for permission, subscribes this browser and registers it for the signed-in guest. */
export async function enablePush(client: OnlineClient): Promise<PushState> {
  const reg = await registration();
  if (!reg) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const { publicKey } = await client.pushKey();
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with another server's key never receives this one's pushes.
  if (sub && !sameKey(sub.options.applicationServerKey, publicKey)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(publicKey) });
  try {
    await client.pushSubscribe(sub.toJSON() as PushSubscriptionRequest);
  } catch (e) {
    // A browser subscription the server does not know would read as "on".
    await sub.unsubscribe().catch(() => {});
    throw e;
  }
  return "on";
}

export async function disablePush(client: OnlineClient): Promise<PushState> {
  const reg = await registration();
  if (!reg) return "unsupported";
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    // Unsubscribing in the browser is what matters; the server forgets the
    // endpoint on its next failed delivery if this request does not arrive.
    await client.pushUnsubscribe(sub.endpoint).catch((e: unknown) => console.warn("Could not unregister push", e));
    await sub.unsubscribe();
  }
  return "off";
}
