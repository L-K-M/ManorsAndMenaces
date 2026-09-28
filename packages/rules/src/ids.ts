// Engine id ordering, shared inside the rules package and kept out of its
// public API (index.ts does not re-export this module).

/** The numeric suffix of an engine id such as `banner_12`, or NaN if it has none. */
function idNumber(id: string): number {
  const n = Number(id.slice(id.lastIndexOf("_") + 1));
  return Number.isInteger(n) ? n : Number.NaN;
}

/**
 * Orders `banner_2` before `banner_10`, the same order as a numeric `en`
 * collation for engine ids. Locale-free on purpose: it is deterministic on
 * every platform (§30), and `localeCompare` with options built an ICU
 * collator per call, which made this sort dominate AI decision time.
 */
export function compareIds(a: string, b: string): number {
  const d = idNumber(a) - idNumber(b);
  if (d) return d;
  return a < b ? -1 : a > b ? 1 : 0;
}
