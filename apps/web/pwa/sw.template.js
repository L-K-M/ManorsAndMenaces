// Service worker for offline play of the web build (spec §76). The build
// (pwa/serviceWorkerPlugin.ts) emits this file as sw.js with the precache
// manifest inlined in place of the placeholder: every file of the release
// and a cache name derived from their contents.
//
// - Install precaches the whole release, so one online visit is enough for
//   later offline starts.
// - Navigations are network-first, so an online start gets the latest
//   release. Offline, they fall back to this release's index.html. The fresh
//   index.html is deliberately not cached: it may belong to a newer release
//   whose files are not in this cache.
// - Files of the release are cache-first; anything else goes to the network
//   untouched. The online API and its WebSocket are never intercepted.
// - A new release's worker waits until a page sends SKIP_WAITING, so a
//   running game never has its files swapped underneath it (src/lib/pwa.svelte.ts).
// - Turn notices pushed by the online server (spec §85) become notifications;
//   clicking one opens its match in the app (src/lib/online/notices.svelte.ts).

const MANIFEST = self.__PRECACHE_MANIFEST__;

const INDEX_URL = new URL("./index.html", self.location.href).href;
const PRECACHE = new Set(MANIFEST.urls.map((url) => new URL(url, self.location.href).href));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(MANIFEST.cacheName)
      // Bypass the HTTP cache: unhashed files such as index.html must come from this release.
      .then((cache) => cache.addAll([...PRECACHE].map((url) => new Request(url, { cache: "reload" })))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(MANIFEST.cachePrefix) && key !== MANIFEST.cacheName).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
  } else if (message?.type === "HAS_FILE") {
    // Lets a page ask whether this worker serves the release it is running.
    event.ports[0]?.postMessage(PRECACHE.has(message.url));
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch((error) => fromCache(INDEX_URL).then((cached) => cached ?? Promise.reject(error))));
    return;
  }
  const file = url.origin + url.pathname;
  if (PRECACHE.has(file)) event.respondWith(fromCache(file).then((cached) => cached ?? fetch(request)));
});

self.addEventListener("push", (event) => {
  let notice = null;
  try {
    notice = event.data ? event.data.json() : null;
  } catch {
    // Unreadable: browsers still require a visible notification for every push.
  }
  const matchId = typeof notice?.matchId === "string" ? notice.matchId : null;
  const options = { body: notice?.body ?? "", data: { matchId }, icon: new URL("./icons/icon-192.png", self.location.href).href };
  // One notification per match: a newer notice replaces the older one.
  if (matchId) options.tag = `match-${matchId}`;
  event.waitUntil(self.registration.showNotification(notice?.title ?? "Manors & Menaces", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const matchId = event.notification.data?.matchId ?? null;
  const url = new URL(matchId ? `./#/match/${encodeURIComponent(matchId)}` : "./", self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const app = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (!app) return self.clients.openWindow(url);
      if (matchId) app.postMessage({ type: "OPEN_MATCH", matchId });
      return app.focus();
    }),
  );
});

function fromCache(url) {
  return caches.open(MANIFEST.cacheName).then((cache) => cache.match(url));
}
