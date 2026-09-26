// Turn notices for when the game is closed (spec §85): in the Android app a
// native watcher keeps a connection and shows them (platform.turnWatch);
// elsewhere, Web Push (push.ts). The lobby's "Notify me when it's my turn"
// box drives whichever this device has.

import { platform, type TurnWatch, type TurnWatchStatus } from "../platform/adapter.js";
import type { OnlineClient } from "./client.js";
import { disablePush, enablePush, pushState, type PushState } from "./push.js";

export type NoticeChannel = "push" | "android";

export interface TurnNoticeSetting {
  channel: NoticeChannel;
  state: PushState;
  /** Android: the phone may hold notices back while it dozes until the app may run in the background. */
  batteryRestricted: boolean;
}

let watching = false;

/** Whether the Android watcher shows system notifications itself, so the page must not repeat them. */
export function watchingInBackground(): boolean {
  return watching;
}

/** Learns whether the watcher is on, without touching Web Push (app start). */
export async function primeWatching(watch = platform.turnWatch): Promise<void> {
  watching = (await watcherStatus(watch))?.enabled ?? false;
}

/** The watcher's status, or null where the app has none (browsers, the desktop app). */
async function watcherStatus(watch: TurnWatch | undefined): Promise<TurnWatchStatus | null> {
  if (!watch) return null;
  try {
    return await watch.status();
  } catch {
    return null;
  }
}

function fromStatus(status: TurnWatchStatus): TurnNoticeSetting {
  watching = status.enabled;
  if (!status.enabled) return { channel: "android", state: "off", batteryRestricted: false };
  return { channel: "android", state: status.notificationsAllowed ? "on" : "denied", batteryRestricted: !status.batteryUnrestricted };
}

const viaPush = async (state: Promise<PushState>): Promise<TurnNoticeSetting> => ({ channel: "push", state: await state, batteryRestricted: false });

export async function turnNoticeSetting(watch = platform.turnWatch): Promise<TurnNoticeSetting> {
  const status = await watcherStatus(watch);
  return status ? fromStatus(status) : viaPush(pushState());
}

export async function enableTurnNotices(client: OnlineClient, watch = platform.turnWatch): Promise<TurnNoticeSetting> {
  if (!watch || !(await watcherStatus(watch))) return viaPush(enablePush(client));
  if (!client.token) throw new Error("sign in first");
  let status = await watch.start(client.serverUrl, client.token);
  if (!status.notificationsAllowed) {
    // It could show nothing, not even its own "listening" notice.
    await watch.stop();
    watching = false;
    return { channel: "android", state: "denied", batteryRestricted: false };
  }
  if (!status.batteryUnrestricted) status = await watch.requestBatteryExemption();
  return fromStatus(status);
}

export async function disableTurnNotices(client: OnlineClient, watch = platform.turnWatch): Promise<TurnNoticeSetting> {
  if (!watch || !(await watcherStatus(watch))) return viaPush(disablePush(client));
  return fromStatus(await watch.stop());
}

/** Asks Android again to let the app run in the background. */
export async function allowInBackground(watch = platform.turnWatch): Promise<TurnNoticeSetting> {
  if (!watch) return turnNoticeSetting(watch);
  return fromStatus(await watch.requestBatteryExemption());
}

/** A new guest session: point turn notices, if on, at it. */
export async function followSession(client: OnlineClient, watch = platform.turnWatch): Promise<TurnNoticeSetting> {
  const status = await watcherStatus(watch);
  if (!status) {
    const state = await pushState();
    return viaPush(state === "on" ? enablePush(client) : Promise.resolve(state));
  }
  if (!status.enabled || !client.token) return fromStatus(status);
  return fromStatus(await (watch as TurnWatch).start(client.serverUrl, client.token));
}
