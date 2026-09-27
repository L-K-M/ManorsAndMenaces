// User settings (spec §50, §52), persisted per browser.

export type AnimationSpeed = "normal" | "fast" | "off";

export interface Settings {
  animationSpeed: AnimationSpeed;
  reducedMotion: boolean;
  highContrast: boolean;
  textScale: number;
  sound: boolean;
  music: boolean;
  soundVolume: number;
  musicVolume: number;
  privacyCurtain: boolean;
  showRegionNames: boolean;
  /** Named AI rivals remark on the game in speech bubbles and the Chronicle. */
  rivalChatter: boolean;
  /**
   * A card another player plays waits on screen until you tap OK, and local
   * computer players wait with it (PlayQueue). Off: toasts and the card
   * flourish show others' plays, as before.
   */
  pauseOnCardPlay: boolean;
  /**
   * Ending a turn asks first when another placement of your Banners would
   * harvest more next turn (BannerWarningDialog).
   */
  bannerWarning: boolean;
}

const KEY = "mm.settings.v1";

const defaults = (): Settings => ({
  animationSpeed: "normal",
  reducedMotion: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
  highContrast: false,
  textScale: 1,
  sound: true,
  music: false,
  soundVolume: 0.65,
  musicVolume: 0.35,
  privacyCurtain: true,
  showRegionNames: true,
  rivalChatter: true,
  pauseOnCardPlay: true,
  bannerWarning: true,
});

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // Storage may be unavailable (private mode); fall back to defaults.
  }
  return defaults();
}

export const settings: Settings = $state(load());

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

/** Multiplier for animation durations; 0 disables animation (logic is unaffected). */
export function animationScale(): number {
  if (settings.reducedMotion || settings.animationSpeed === "off") return 0;
  return settings.animationSpeed === "fast" ? 0.45 : 1;
}
