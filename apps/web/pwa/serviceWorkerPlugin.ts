// Emits the offline service worker (spec §76) for production builds. The
// worker source is pwa/sw.template.js; this plugin inlines a precache manifest
// that lists every file of the build and names the cache after a hash of
// their contents. Each release therefore installs as a new worker with its
// own cache, and the worker's activate step deletes the older caches.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";

/** Where the worker is served, next to index.html. The page and the server smoke test rely on this URL. */
export const SERVICE_WORKER_FILE = "sw.js";

/** Every cache this app's worker creates starts with this; `activate` deletes the other releases' caches by it. */
export const CACHE_PREFIX = "manors-menaces-";

/** The expression in sw.template.js that the build replaces with the manifest literal. */
export const MANIFEST_PLACEHOLDER = "self.__PRECACHE_MANIFEST__";

const TEMPLATE = new URL("./sw.template.js", import.meta.url);

export interface BuildFile {
  /** Path relative to the build output directory, with forward slashes. */
  fileName: string;
  content: string | Uint8Array;
}

export interface PrecacheManifest {
  cachePrefix: string;
  cacheName: string;
  /** URLs relative to the worker, sorted. */
  urls: string[];
}

/** Source maps, hidden files (such as `.vite/manifest.json`) and the worker itself are not part of the app. */
export function isPrecached(fileName: string): boolean {
  if (fileName === SERVICE_WORKER_FILE || fileName.endsWith(".map")) return false;
  return !fileName.split("/").some((part) => part.startsWith("."));
}

export function createPrecacheManifest(files: readonly BuildFile[], version: string): PrecacheManifest {
  const kept = files.filter((f) => isPrecached(f.fileName)).sort((a, b) => (a.fileName < b.fileName ? -1 : a.fileName > b.fileName ? 1 : 0));
  const hash = createHash("sha256");
  for (const file of kept) hash.update(file.fileName).update("\0").update(file.content).update("\0");
  return {
    cachePrefix: CACHE_PREFIX,
    cacheName: `${CACHE_PREFIX}${version}-${hash.digest("hex").slice(0, 12)}`,
    urls: kept.map((f) => `./${f.fileName}`),
  };
}

export function renderServiceWorker(template: string, manifest: PrecacheManifest): string {
  const occurrences = template.split(MANIFEST_PLACEHOLDER).length - 1;
  if (occurrences !== 1) throw new Error(`The service worker template must contain ${MANIFEST_PLACEHOLDER} exactly once (found ${occurrences}).`);
  // A replacer function, so `$` sequences in the JSON are not treated as patterns.
  return template.replace(MANIFEST_PLACEHOLDER, () => JSON.stringify(manifest));
}

function listFiles(dir: string, root = dir): BuildFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path, root);
    return entry.isFile() ? [{ fileName: relative(root, path).split(sep).join("/"), content: readFileSync(path) }] : [];
  });
}

export function serviceWorkerPlugin(options: { version: string }): Plugin {
  let publicDir = "";
  return {
    name: "manors-menaces:service-worker",
    apply: "build",
    // After Vite's HTML plugin, so index.html is in the bundle.
    enforce: "post",
    configResolved(config) {
      publicDir = config.build.copyPublicDir && config.publicDir && existsSync(config.publicDir) ? config.publicDir : "";
    },
    generateBundle(_output, bundle) {
      const files = new Map<string, BuildFile["content"]>();
      if (publicDir) for (const file of listFiles(publicDir)) files.set(file.fileName, file.content);
      for (const output of Object.values(bundle)) files.set(output.fileName, output.type === "chunk" ? output.code : output.source);
      const manifest = createPrecacheManifest(
        [...files].map(([fileName, content]) => ({ fileName, content })),
        options.version,
      );
      this.emitFile({ type: "asset", fileName: SERVICE_WORKER_FILE, source: renderServiceWorker(readFileSync(TEMPLATE, "utf8"), manifest) });
    },
  };
}
