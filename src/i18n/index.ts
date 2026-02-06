import { type Locale, translations, defaultLocale, locales } from "./translations.ts";

/**
 * Get translated string for a key in the given locale.
 * Placeholders like {name} are replaced with the values from the second argument.
 */
export function t(
  locale: string,
  key: string,
  params?: Record<string, string | number>
): string {
  const normalizedLocale = normalizeLocale(locale);
  const dict = translations[normalizedLocale as Locale] ?? translations[defaultLocale];
  let value = dict[key] ?? translations[defaultLocale][key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return value;
}

function normalizeLocale(locale: string): string {
  const lower = locale.toLowerCase();
  if (lower === "pt-br" || lower === "pt_br") return "pt-br";
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("es")) return "es";
  return lower;
}

export { translations, defaultLocale, locales };
export type { Locale };
