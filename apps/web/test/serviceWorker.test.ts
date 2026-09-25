import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  CACHE_PREFIX,
  createPrecacheManifest,
  MANIFEST_PLACEHOLDER,
  renderServiceWorker,
  type BuildFile,
  type PrecacheManifest,
} from "../pwa/serviceWorkerPlugin.js";

const TEMPLATE = readFileSync(new URL("../pwa/sw.template.js", import.meta.url), "utf8");

const build: BuildFile[] = [
  { fileName: "index.html", content: "<html></html>" },
  { fileName: "assets/index-abc123.js", content: "console.log(1)" },
  { fileName: "assets/index-abc123.js.map", content: "{}" },
  { fileName: "assets/index-def456.css", content: "body{}" },
  { fileName: "icons/icon-192.png", content: new Uint8Array([1, 2, 3]) },
  { fileName: "manifest.webmanifest", content: "{}" },
  { fileName: "sw.js", content: "old worker" },
  { fileName: ".vite/manifest.json", content: "{}" },
];

describe("precache manifest", () => {
  it("lists every file of the app relative to the worker, sorted, without maps, hidden files or the worker", () => {
    expect(createPrecacheManifest(build, "1.2.3").urls).toEqual([
      "./assets/index-abc123.js",
      "./assets/index-def456.css",
      "./icons/icon-192.png",
      "./index.html",
      "./manifest.webmanifest",
    ]);
  });

  it("names the cache after the version and the contents, independent of file order", () => {
    const manifest = createPrecacheManifest(build, "1.2.3");
    expect(manifest.cachePrefix).toBe(CACHE_PREFIX);
    expect(manifest.cacheName).toMatch(new RegExp(`^${CACHE_PREFIX}1\\.2\\.3-[0-9a-f]{12}$`));
    expect(createPrecacheManifest([...build].reverse(), "1.2.3").cacheName).toBe(manifest.cacheName);
  });

  it("gives a new release a new cache name when any shipped file changes, even one with a fixed name", () => {
    const base = createPrecacheManifest(build, "1.2.3").cacheName;
    const edit = (fileName: string, content: BuildFile["content"]) => build.map((f) => (f.fileName === fileName ? { fileName, content } : f));
    expect(createPrecacheManifest(edit("index.html", "<html>new</html>"), "1.2.3").cacheName).not.toBe(base);
    expect(createPrecacheManifest(edit("icons/icon-192.png", new Uint8Array([9])), "1.2.3").cacheName).not.toBe(base);
    expect(createPrecacheManifest(build, "1.2.4").cacheName).not.toBe(base);
    // Files the worker does not cache do not make a new release.
    expect(createPrecacheManifest(edit("assets/index-abc123.js.map", "{ }"), "1.2.3").cacheName).toBe(base);
  });
});

describe("renderServiceWorker", () => {
  const manifest = createPrecacheManifest(build, "1.2.3");

  it("inlines the manifest in place of the placeholder", () => {
    const sw = renderServiceWorker(TEMPLATE, manifest);
    expect(sw).not.toContain(MANIFEST_PLACEHOLDER);
    expect(sw).toContain(`const MANIFEST = ${JSON.stringify(manifest)};`);
  });

  it("keeps $ sequences in the manifest literally", () => {
    const odd: PrecacheManifest = { ...manifest, urls: ["./assets/a$&b.js"] };
    expect(renderServiceWorker(`x = ${MANIFEST_PLACEHOLDER};`, odd)).toBe(`x = ${JSON.stringify(odd)};`);
  });

  it("rejects a template without exactly one placeholder", () => {
    expect(() => renderServiceWorker("const MANIFEST = {};", manifest)).toThrow(/exactly once/);
    expect(() => renderServiceWorker(`${MANIFEST_PLACEHOLDER}${MANIFEST_PLACEHOLDER}`, manifest)).toThrow(/exactly once/);
  });
});

// The generated worker, run against minimal fakes of the service worker globals.
describe("generated service worker", () => {
  const ORIGIN = "https://play.example";
  const manifest = createPrecacheManifest(build, "1.2.3");

  type Listener = (event: unknown) => void;

  function boot(options: { online: boolean }) {
    const listeners = new Map<string, Listener>();
    const stores = new Map<string, Map<string, Response>>([
      [`${CACHE_PREFIX}v1`, new Map()],
      ["someone-elses-cache", new Map()],
    ]);
    const cacheApi = (store: Map<string, Response>) => ({
      match: async (key: string | Request) => store.get(typeof key === "string" ? key : key.url)?.clone(),
      put: async (key: string, res: Response) => void store.set(key, res),
      addAll: async (requests: Request[]) => {
        for (const r of requests) store.set(r.url, new Response(`precached ${new URL(r.url).pathname}`));
      },
    });
    const caches = {
      open: async (name: string) => {
        if (!stores.has(name)) stores.set(name, new Map());
        return cacheApi(stores.get(name)!);
      },
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
    };
    const fetch = async (request: Request) => {
      if (!options.online) throw new TypeError("Failed to fetch");
      return new Response(`network ${new URL(request.url).pathname}`);
    };
    const self = {
      location: new URL(`${ORIGIN}/sw.js`),
      addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
      clients: { claim: async () => undefined },
      skipWaiting: async () => undefined,
    };
    runInNewContext(renderServiceWorker(TEMPLATE, manifest), { self, caches, fetch, URL, Request, Response, Set, Promise });

    /** Dispatches an extendable event and waits for everything it extended its lifetime with. */
    async function dispatch(type: string, fields: Record<string, unknown> = {}) {
      const pending: Promise<unknown>[] = [];
      let response: Promise<Response> | undefined;
      const event = { ...fields, waitUntil: (p: Promise<unknown>) => pending.push(p), respondWith: (p: Promise<Response>) => (response = p) };
      listeners.get(type)?.(event);
      await Promise.all(pending);
      return response;
    }
    const get = (path: string, mode: RequestMode = "cors", origin = ORIGIN) => dispatch("fetch", { request: { url: `${origin}${path}`, method: "GET", mode } });
    // dispatch() resolves to the response the worker answered with, if any.
    const text = async (answer: Promise<Response | undefined>) => (await answer)?.text() ?? "not intercepted";
    return { stores, dispatch, get, text };
  }

  it("precaches the release on install and deletes only this app's older caches on activate", async () => {
    const sw = boot({ online: true });
    await sw.dispatch("install");
    expect([...sw.stores.get(manifest.cacheName)!.keys()]).toEqual(manifest.urls.map((u) => new URL(u, `${ORIGIN}/`).href));

    await sw.dispatch("activate");
    expect([...sw.stores.keys()].sort()).toEqual([manifest.cacheName, "someone-elses-cache"].sort());
  });

  it("serves release files from the cache and starts offline from the cached index.html", async () => {
    const sw = boot({ online: false });
    await sw.dispatch("install");

    expect(await sw.text(sw.get("/assets/index-abc123.js"))).toBe("precached /assets/index-abc123.js");
    expect(await sw.text(sw.get("/", "navigate"))).toBe("precached /index.html");
    expect(await sw.text(sw.get("/some/deep/link", "navigate"))).toBe("precached /index.html");
  });

  it("prefers the network for navigations when online", async () => {
    const sw = boot({ online: true });
    await sw.dispatch("install");
    expect(await sw.text(sw.get("/", "navigate"))).toBe("network /");
  });

  it("leaves the online API, other origins, other methods and unknown files alone", async () => {
    const sw = boot({ online: true });
    await sw.dispatch("install");
    expect(await sw.text(sw.get("/api/matches"))).toBe("not intercepted");
    expect(await sw.text(sw.get("/api/ws", "navigate"))).toBe("not intercepted");
    expect(await sw.text(sw.get("/assets/index-abc123.js", "cors", "https://cdn.example"))).toBe("not intercepted");
    expect(await sw.text(sw.get("/assets/index-abc123.js.map"))).toBe("not intercepted");
    const post = await sw.dispatch("fetch", { request: { url: `${ORIGIN}/assets/index-abc123.js`, method: "POST", mode: "cors" } });
    expect(post).toBeUndefined();
  });

  it("tells a page whether it precached a given file", async () => {
    const sw = boot({ online: true });
    const ask = async (url: string) => {
      let reply: unknown;
      await sw.dispatch("message", { data: { type: "HAS_FILE", url }, ports: [{ postMessage: (v: unknown) => (reply = v) }] });
      return reply;
    };
    expect(await ask(`${ORIGIN}/assets/index-abc123.js`)).toBe(true);
    expect(await ask(`${ORIGIN}/assets/index-old999.js`)).toBe(false);
  });
});
