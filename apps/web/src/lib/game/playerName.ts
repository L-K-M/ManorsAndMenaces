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

/**
 * After a browser accepts an invite, the invite page sends it here with
 * `?invited=<name>` (apps/server/src/app.ts): remember that name as the
 * player's, and return the address without it (null when there is none).
 */
export function takeInvitedName(url: URL): URL | null {
  const name = url.searchParams.get("invited");
  if (name === null) return null;
  rememberName(name);
  const clean = new URL(url);
  clean.searchParams.delete("invited");
  return clean;
}
