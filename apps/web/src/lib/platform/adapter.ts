// Platform adapters (spec §74): game code never imports Tauri APIs directly.

import type { SaveFile } from "@manors-menaces/protocol";
import { describeSave, type SaveMeta } from "../game/saves.js";

export interface SaveSummary {
  id: string;
  savedAt: string;
  label: string;
  meta: SaveMeta;
}

export interface PlatformAdapter {
  readonly kind: "browser" | "tauri";
  /** Stored saves, newest first. Rejects when storage is unavailable. */
  listSaves(): Promise<SaveSummary[]>;
  /** Resolves once the save is durably stored; rejects otherwise. */
  save(id: string, label: string, data: SaveFile): Promise<void>;
  load(id: string): Promise<SaveFile | null>;
  remove(id: string): Promise<void>;
  /**
   * Export a save to a user-visible file. Resolves false when the player
   * cancelled the save dialog, true when the file was written or handed to
   * the browser as a download.
   */
  exportFile(name: string, data: string): Promise<boolean>;
  notify(title: string, body: string): Promise<void>;
}

// ------------------------------------------------------------------ IndexedDB (spec §75)

const DB = "manors-menaces";
const STORE = "saves";

/**
 * An IndexedDB object store behind one reused connection. The connection is
 * dropped when another tab needs a schema upgrade (so that tab is not
 * blocked) or when the browser closes it; the next operation reopens it.
 */
class SaveStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => {
        const db = req.result;
        const forget = () => {
          if (this.db === opening) this.db = null;
        };
        db.onversionchange = () => {
          db.close();
          forget();
        };
        db.onclose = forget;
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    });
    this.db = opening;
    // A failed open is not cached, so a later call can succeed.
    opening.catch(() => {
      if (this.db === opening) this.db = null;
    });
    return opening;
  }

  /** Run one request; resolves with its result only after the transaction commits. */
  async run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      const fail = () => reject(tx.error ?? req.error ?? new Error("IndexedDB transaction failed"));
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = fail;
      tx.onerror = fail;
    });
  }
}

interface Row {
  id: string;
  label: string;
  savedAt: string;
  data: SaveFile;
}

export class BrowserPlatformAdapter implements PlatformAdapter {
  readonly kind: "browser" | "tauri" = "browser";
  private readonly store = new SaveStore();

  async listSaves(): Promise<SaveSummary[]> {
    const rows = await this.store.run<Row[]>("readonly", (s) => s.getAll() as IDBRequest<Row[]>);
    return rows
      .map((r) => ({ id: r.id, label: r.label, savedAt: r.savedAt, meta: describeSave(r.data) }))
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }
  async save(id: string, label: string, data: SaveFile): Promise<void> {
    // Game state may be a reactive proxy; IndexedDB needs plain data (§106).
    const plain = JSON.parse(JSON.stringify(data)) as SaveFile;
    await this.store.run("readwrite", (s) => s.put({ id, label, savedAt: plain.savedAt, data: plain } satisfies Row));
  }
  async load(id: string): Promise<SaveFile | null> {
    const row = await this.store.run<Row | undefined>("readonly", (s) => s.get(id) as IDBRequest<Row | undefined>);
    return row?.data ?? null;
  }
  async remove(id: string): Promise<void> {
    await this.store.run("readwrite", (s) => s.delete(id));
  }
  async exportFile(name: string, data: string): Promise<boolean> {
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  async notify(title: string, body: string): Promise<void> {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission === "granted" && document.hidden) new Notification(title, { body });
  }
}

/**
 * Tauri adapter. Saves stay in the webview's IndexedDB (persisted by Tauri in
 * the app data directory); exports and notifications use Tauri plugins through
 * the global `__TAURI__` bridge so the web bundle has no Tauri dependency.
 */
export class TauriPlatformAdapter extends BrowserPlatformAdapter {
  override readonly kind = "tauri" as const;

  private get tauri(): TauriGlobal | undefined {
    return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  }
  override async exportFile(name: string, data: string): Promise<boolean> {
    const t = this.tauri;
    if (!t?.dialog || !t.fs) return super.exportFile(name, data);
    const path = await t.dialog.save({ defaultPath: name, filters: [{ name: "Manors & Menaces save", extensions: ["json"] }] });
    if (!path) return false;
    await t.fs.writeTextFile(path, data);
    return true;
  }
  override async notify(title: string, body: string): Promise<void> {
    const n = this.tauri?.notification;
    if (!n) return super.notify(title, body);
    let granted = await n.isPermissionGranted();
    if (!granted) granted = (await n.requestPermission()) === "granted";
    if (granted) n.sendNotification({ title, body });
  }
}

interface TauriGlobal {
  dialog?: { save(opts: { defaultPath: string; filters: { name: string; extensions: string[] }[] }): Promise<string | null> };
  fs?: { writeTextFile(path: string, data: string): Promise<void> };
  notification?: {
    isPermissionGranted(): Promise<boolean>;
    requestPermission(): Promise<string>;
    sendNotification(opts: { title: string; body: string }): void;
  };
}

export const platform: PlatformAdapter =
  typeof window !== "undefined" && "__TAURI__" in window ? new TauriPlatformAdapter() : new BrowserPlatformAdapter();
