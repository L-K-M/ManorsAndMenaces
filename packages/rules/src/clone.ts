/** Own-property lookup, so ids like "__proto__" never resolve through the prototype chain. */
export function own<T>(record: Record<string, T>, key: unknown): T | undefined {
  return typeof key === "string" && Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * Deep clone for plain JSON-compatible data (spec §106: state contains only
 * records, arrays and primitives). Faster than structuredClone for our shapes
 * and available in every runtime without DOM typings.
 */
export function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(clone) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const v = (value as Record<string, unknown>)[key];
    if (v === undefined) continue;
    // JSON.parse yields "__proto__" as an own key. Assigning it would set the
    // copy's prototype, so untrusted fields could later be read as inherited
    // ones; keep it as plain data instead.
    if (key === "__proto__") Object.defineProperty(out, key, { value: clone(v), enumerable: true, writable: true, configurable: true });
    else out[key] = clone(v);
  }
  return out as T;
}
