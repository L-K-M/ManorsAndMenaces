// PUBLIC_URL, where players open the game. Turn emails (mail.ts) and
// giveaway invites (giveaway.ts) build their links on it, so both read it
// through here and agree on what it may be.

/**
 * PUBLIC_URL as a base for links, without a trailing slash, or null when it is
 * not an http(s) address a player could open. A query or fragment would break
 * the paths appended to it, and a login in it would ride along in every link
 * handed out. A path prefix is fine: https://example.org/games.
 */
export function publicUrlBase(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) return null;
  return url.href.replace(/\/+$/, "");
}
