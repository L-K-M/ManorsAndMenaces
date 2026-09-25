// A minimal in-memory IndexedDB covering only what the platform adapter uses:
// one keyPath store, get/getAll/put/delete, and transaction commit/abort.
// Writes become visible only when their transaction commits, like the real
// thing, so tests can tell "request succeeded" from "data is durable".

type Handler = ((ev: unknown) => void) | null;

class FakeRequest<T> {
  result!: T;
  error: Error | null = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;
  onblocked: Handler = null;
}

class FakeStore {
  constructor(
    private readonly tx: FakeTransaction,
    private readonly keyPath: string,
  ) {}
  private request<T>(run: () => T): FakeRequest<T> {
    const req = new FakeRequest<T>();
    this.tx.pending++;
    queueMicrotask(() => {
      req.result = run();
      req.onsuccess?.({});
      this.tx.settle();
    });
    return req;
  }
  get(key: string) {
    return this.request(() => structuredClone(this.tx.db.rows.get(key)));
  }
  getAll() {
    return this.request(() => [...this.tx.db.rows.values()].map((r) => structuredClone(r)));
  }
  put(value: Record<string, unknown>) {
    return this.request(() => {
      const key = String(value[this.keyPath]);
      this.tx.writes.push(() => this.tx.db.rows.set(key, structuredClone(value)));
      return key;
    });
  }
  delete(key: string) {
    return this.request(() => {
      this.tx.writes.push(() => this.tx.db.rows.delete(key));
      return undefined;
    });
  }
}

class FakeTransaction {
  pending = 0;
  writes: (() => void)[] = [];
  error: Error | null = null;
  oncomplete: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;
  constructor(
    readonly db: FakeDatabase,
    private readonly factory: FakeIndexedDB,
  ) {}
  objectStore(_name: string) {
    return new FakeStore(this, this.db.keyPath);
  }
  settle(): void {
    if (--this.pending > 0) return;
    // Commit happens after the last request's success callback, as in IDB.
    setTimeout(() => {
      if (this.factory.failCommits) {
        // A failed commit fires only "abort": no request failed, so no
        // "error" event reaches the transaction.
        this.error = new Error("QuotaExceededError");
        this.onabort?.({});
        return;
      }
      for (const w of this.writes) w();
      this.oncomplete?.({});
    });
  }
}

class FakeDatabase {
  rows = new Map<string, unknown>();
  keyPath = "id";
  closed = false;
  version = 1;
  onversionchange: Handler = null;
  onclose: Handler = null;
  constructor(private readonly factory: FakeIndexedDB) {}
  createObjectStore(_name: string, opts: { keyPath: string }) {
    this.keyPath = opts.keyPath;
    this.factory.keyPath = opts.keyPath;
  }
  transaction(_store: string, _mode: string) {
    if (this.closed) throw new Error("InvalidStateError: the connection is closed");
    return new FakeTransaction(this, this.factory);
  }
  close(): void {
    this.closed = true;
  }
}

export class FakeIndexedDB {
  opens = 0;
  failCommits = false;
  /** The store outlives connections, like its rows: reopening keeps it. */
  keyPath = "id";
  private rows = new Map<string, unknown>();
  readonly connections: FakeDatabase[] = [];

  open(_name: string, version = 1) {
    this.opens++;
    const req = new FakeRequest<FakeDatabase>();
    setTimeout(() => {
      const db = new FakeDatabase(this);
      db.rows = this.rows;
      db.keyPath = this.keyPath;
      const upgrade = this.connections.length === 0;
      this.connections.push(db);
      req.result = db;
      if (upgrade) req.onupgradeneeded?.({});
      db.version = version;
      req.onsuccess?.({});
    });
    return req;
  }

  /** Simulate another tab opening a newer schema version. */
  requestUpgrade(): void {
    for (const db of this.connections) if (!db.closed) db.onversionchange?.({});
  }
}
