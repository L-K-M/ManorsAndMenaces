/**
 * Keeps the `limit` most recently used entries. Every game draws its own
 * layout (layout.ts), so an unbounded cache would keep one map per game a
 * long-running server has ever served.
 */
export function recentCache<V>(limit: number): { get(key: string): V | undefined; set(key: string, value: V): void } {
  const entries = new Map<string, V>();
  return {
    get(key) {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size <= limit) return;
      const oldest = entries.keys().next();
      if (!oldest.done) entries.delete(oldest.value);
    },
  };
}
