import type { RngState } from "./types.js";

// Seeded sfc32 PRNG (spec §65). All state is four uint32s stored in GameState,
// so it serializes and replays identically on every platform. Gameplay never
// calls Math.random().

export interface GameRng {
  nextUint32(): number;
  /** Unbiased integer in [0, maxExclusive), via rejection sampling. */
  nextInt(maxExclusive: number): number;
  /** nextUint32() / 2**32. Never use for rules outcomes. */
  nextFloat(): number;
  shuffle<T>(items: readonly T[]): T[];
  pick<T>(items: readonly T[]): T;
  readonly state: RngState;
}

/** Hash a seed string into an initial RNG state (cyrb128). */
export function seedRng(seed: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const state: RngState = [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
  // Warm up so similar seeds diverge.
  const rng = createRng(state);
  for (let i = 0; i < 15; i++) rng.nextUint32();
  return rng.state;
}

/** Creates a generator over a copy of `initial`; read `.state` to persist it. */
export function createRng(initial: RngState): GameRng {
  let [a, b, c, d] = initial;
  const nextUint32 = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
  const nextInt = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new RangeError("maxExclusive must be a positive integer");
    const limit = 0x100000000 - (0x100000000 % maxExclusive);
    for (;;) {
      const x = nextUint32();
      if (x < limit) return x % maxExclusive;
    }
  };
  return {
    nextUint32,
    nextInt,
    nextFloat: () => nextUint32() / 0x100000000,
    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = nextInt(i + 1);
        const tmp = out[i] as T;
        out[i] = out[j] as T;
        out[j] = tmp;
      }
      return out;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError("pick from empty list");
      return items[nextInt(items.length)] as T;
    },
    get state(): RngState {
      return [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
    },
  };
}
