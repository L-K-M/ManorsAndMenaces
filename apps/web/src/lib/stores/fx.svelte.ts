// Resource tokens still in flight (spec §50). The state already holds the new
// totals; counters subtract what has not landed yet, so they tick up as each
// token arrives. Owned by HarvestFlights, which holds a token here when it
// plans it and always releases it (landed, dropped or torn down).

export const fx: { incoming: Record<string, number> } = $state({ incoming: {} });

export function holdIncoming(key: string, count = 1): void {
  fx.incoming[key] = (fx.incoming[key] ?? 0) + count;
}

export function releaseIncoming(key: string, count = 1): void {
  const left = (fx.incoming[key] ?? 0) - count;
  if (left > 0) fx.incoming[key] = left;
  else delete fx.incoming[key];
}

export function clearIncoming(): void {
  fx.incoming = {};
}

/** The value a counter shows while tokens for it are still flying. */
export function shownCount(actual: number, key: string): number {
  return Math.max(0, actual - (fx.incoming[key] ?? 0));
}
