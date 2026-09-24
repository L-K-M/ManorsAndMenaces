// Structured development logging (spec §99). Silent in production builds;
// never logs hidden card identities of other players (it only sees what this
// client already has).

export type LogCategory = "rules" | "command" | "event" | "network" | "render" | "ai";

const enabled = import.meta.env.DEV;

export function devlog(category: LogCategory, message: string, data?: unknown): void {
  if (!enabled) return;
  console.debug(`[${category}] ${message}`, ...(data === undefined ? [] : [data]));
}
