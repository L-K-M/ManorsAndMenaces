// The name you last played under, locally or online, remembered per browser so
// the next New Game (and the online lobby) starts with it.

const KEY = "mm.playerName.v1";

export function rememberedName(): string {
  try {
    return localStorage.getItem(KEY)?.trim() ?? "";
  } catch {
    // Storage may be unavailable (private mode); nothing is remembered.
    return "";
  }
}

export function rememberName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(KEY, trimmed);
  } catch {
    // ignore
  }
}
