import { afterEach, describe, expect, it, vi } from "vitest";
import type { OnlineClient } from "../src/lib/online/client.js";
import { enablePush } from "../src/lib/online/push.js";

// A browser with a service worker and push support, granting permission.
function browser() {
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/x", options: { applicationServerKey: null }, toJSON: () => ({}), unsubscribe: vi.fn(async () => true) };
  const pushManager = { getSubscription: vi.fn(async () => null), subscribe: vi.fn(async () => subscription) };
  vi.stubGlobal("navigator", { serviceWorker: { getRegistration: async () => ({ pushManager }) } });
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", { permission: "default", requestPermission: async () => "granted" });
  return { subscription, pushManager };
}

afterEach(() => vi.unstubAllGlobals());

describe("enablePush", () => {
  it("is on once the server has the subscription", async () => {
    const { subscription } = browser();
    const client = { pushKey: async () => ({ publicKey: "BAAA" }), pushSubscribe: vi.fn(async () => {}) } as unknown as OnlineClient;
    expect(await enablePush(client)).toBe("on");
    expect(subscription.unsubscribe).not.toHaveBeenCalled();
  });

  it("does not leave the browser subscribed when the server refuses it", async () => {
    const { subscription } = browser();
    const refused = new Error("409");
    const client = { pushKey: async () => ({ publicKey: "BAAA" }), pushSubscribe: async () => Promise.reject(refused) } as unknown as OnlineClient;
    await expect(enablePush(client)).rejects.toBe(refused);
    // Otherwise the toggle would read "on" at the next visit (pushState).
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
});
