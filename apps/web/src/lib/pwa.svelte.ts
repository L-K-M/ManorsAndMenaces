// Offline support for the web build (spec §76). Registers the service worker
// that pwa/serviceWorkerPlugin.ts emits and tells the player when a newer
// release has been installed in the background (UpdatePrompt.svelte).
//
// Navigations are network-first, so a page loaded online already runs the
// latest release even while an older worker controls it. When the new
// worker serves the release this page runs, it takes over silently; only a
// page running an older release (one left open across a deploy, or started
// offline) is offered a reload.

export const appUpdate: { ready: boolean } = $state({ ready: false });

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const WORKER_REPLY_TIMEOUT_MS = 3000;

let waitingWorker: ServiceWorker | null = null;

/** Not in the dev server, and not in Tauri, whose shell serves the app from local files. */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD || "__TAURI__" in window) return;
  window.addEventListener("load", () => void register());
}

async function register(): Promise<void> {
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register("./sw.js");
  } catch (e) {
    console.warn("Offline play is unavailable: the service worker did not register.", e);
    return;
  }

  if (registration.waiting && navigator.serviceWorker.controller) void offer(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => {
      // Without a controller this is the first install, which activates by itself.
      if (worker.state === "installed" && navigator.serviceWorker.controller) void offer(worker);
    });
  });
  // Long sessions (a game left open for hours) still hear about new releases.
  setInterval(() => void registration.update().catch(() => undefined), UPDATE_CHECK_INTERVAL_MS);
}

async function offer(worker: ServiceWorker): Promise<void> {
  if (await servesThisRelease(worker)) {
    worker.postMessage({ type: "SKIP_WAITING" });
    return;
  }
  waitingWorker = worker;
  appUpdate.ready = true;
}

/** Whether `worker` precached this very bundle, i.e. it belongs to the release this page runs. */
function servesThisRelease(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), WORKER_REPLY_TIMEOUT_MS);
    channel.port1.onmessage = (e: MessageEvent) => {
      clearTimeout(timer);
      resolve(e.data === true);
    };
    worker.postMessage({ type: "HAS_FILE", url: import.meta.url }, [channel.port2]);
  });
}

/** Activates the waiting release and reloads into it. */
export function applyUpdate(): void {
  const worker = waitingWorker;
  if (!worker) return;
  appUpdate.ready = false;
  // Another tab may already have activated it, or a newer release replaced it;
  // either way a reload picks up the current one.
  const settled = () => worker.state === "activated" || worker.state === "redundant";
  if (settled()) {
    location.reload();
    return;
  }
  worker.addEventListener("statechange", () => {
    if (settled()) location.reload();
  });
  worker.postMessage({ type: "SKIP_WAITING" });
}

/** Hides the prompt; the waiting release starts the next time the app is opened. */
export function dismissUpdate(): void {
  appUpdate.ready = false;
}
