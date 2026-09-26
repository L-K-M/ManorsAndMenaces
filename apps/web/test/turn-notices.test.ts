import { afterEach, describe, expect, it, vi } from "vitest";
import type { OnlineClient } from "../src/lib/online/client.js";
import { disableTurnNotices, enableTurnNotices, followSession, turnNoticeSetting, watchingInBackground } from "../src/lib/online/turnNotices.js";
import type { TurnWatch, TurnWatchStatus } from "../src/lib/platform/adapter.js";

// In the Android app, turn notices while the app is closed come from a native
// watcher (src-tauri/gen/android/.../turnwatch); elsewhere from Web Push.

const client = { serverUrl: "https://play.example.org", token: "tok-1", pushSubscribe: vi.fn(), pushUnsubscribe: vi.fn(), pushKey: vi.fn() } as unknown as OnlineClient;

function watcher(initial: Partial<TurnWatchStatus> = {}, answers: { notifications?: boolean; battery?: boolean } = {}) {
  let status: TurnWatchStatus = { enabled: false, notificationsAllowed: answers.notifications ?? true, batteryUnrestricted: false, ...initial };
  const watch = {
    status: vi.fn(async () => status),
    start: vi.fn(async () => (status = { ...status, enabled: true })),
    stop: vi.fn(async () => (status = { ...status, enabled: false })),
    requestBatteryExemption: vi.fn(async () => (status = { ...status, batteryUnrestricted: answers.battery ?? false })),
    takeOpenedMatch: vi.fn(async () => null),
  } satisfies TurnWatch;
  return watch;
}

afterEach(() => vi.unstubAllGlobals());

describe("turn notices in the Android app", () => {
  it("start the watcher for this server and guest, and ask to keep running while the phone dozes", async () => {
    const watch = watcher();
    expect(await turnNoticeSetting(watch)).toEqual({ channel: "android", state: "off", batteryRestricted: false });

    const setting = await enableTurnNotices(client, watch);
    expect(watch.start).toHaveBeenCalledWith("https://play.example.org", "tok-1");
    expect(watch.requestBatteryExemption).toHaveBeenCalled();
    // Android's answer comes later; until then, say that turns may arrive late.
    expect(setting).toEqual({ channel: "android", state: "on", batteryRestricted: true });
    expect(watchingInBackground()).toBe(true);
    // Web Push is not involved.
    expect(client.pushSubscribe).not.toHaveBeenCalled();
  });

  it("do not ask about the battery again once it is allowed", async () => {
    const watch = watcher({ batteryUnrestricted: true });
    expect(await enableTurnNotices(client, watch)).toEqual({ channel: "android", state: "on", batteryRestricted: false });
    expect(watch.requestBatteryExemption).not.toHaveBeenCalled();
  });

  it("stay off when notifications are turned off for the app", async () => {
    const watch = watcher({}, { notifications: false });
    expect(await enableTurnNotices(client, watch)).toEqual({ channel: "android", state: "denied", batteryRestricted: false });
    expect(watch.stop).toHaveBeenCalled();
    expect(watchingInBackground()).toBe(false);
  });

  it("stop the watcher when turned off", async () => {
    const watch = watcher({ enabled: true, batteryUnrestricted: true });
    expect(await disableTurnNotices(client, watch)).toEqual({ channel: "android", state: "off", batteryRestricted: false });
    expect(watch.stop).toHaveBeenCalled();
    expect(watchingInBackground()).toBe(false);
  });

  it("follow a new guest session, and leave a watcher that is off alone", async () => {
    const on = watcher({ enabled: true, batteryUnrestricted: true });
    await followSession({ ...client, token: "tok-2" } as OnlineClient, on);
    expect(on.start).toHaveBeenCalledWith("https://play.example.org", "tok-2");

    const off = watcher();
    await followSession(client, off);
    expect(off.start).not.toHaveBeenCalled();
  });
});

describe("turn notices elsewhere", () => {
  it("use Web Push where there is no watcher, such as the desktop app", async () => {
    const missing = { ...watcher(), status: vi.fn(async () => Promise.reject(new Error("Command status not found"))) };
    // No service worker here, as in the desktop app and the dev server.
    vi.stubGlobal("navigator", {});
    expect(await turnNoticeSetting(missing)).toEqual({ channel: "push", state: "unsupported", batteryRestricted: false });
    expect(await turnNoticeSetting(undefined)).toEqual({ channel: "push", state: "unsupported", batteryRestricted: false });
  });
});
