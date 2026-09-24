import { EN } from "@manors-menaces/content";

// Localization (spec §71). All user-facing text goes through t(); the rules
// engine only deals in ids.
const catalogs: Record<string, Record<string, string>> = { en: EN };
let locale = "en";

export function setLocale(next: string): void {
  if (catalogs[next]) locale = next;
}

export function t(key: string, params: Record<string, string | number> = {}): string {
  const template = catalogs[locale]?.[key] ?? EN[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

export function hasKey(key: string): boolean {
  return key in (catalogs[locale] ?? EN);
}
