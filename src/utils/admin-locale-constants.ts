/** Constantes de locales do admin (sem dependência de banco). */

export const ADMIN_URL_LOCALES = ["pt-br", "es", "en"] as const;

export const ADMIN_DB_LOCALE_CODES = ["pt_BR", "es_ES", "en_US"] as const;

export type AdminDbLocaleCode = (typeof ADMIN_DB_LOCALE_CODES)[number];

export const ADMIN_URL_TO_DB_LOCALE: Record<string, AdminDbLocaleCode> = {
  "pt-br": "pt_BR",
  es: "es_ES",
  en: "en_US",
};

export const ADMIN_DB_TO_URL_LOCALE: Record<AdminDbLocaleCode, string> = {
  pt_BR: "pt-br",
  es_ES: "es",
  en_US: "en",
};

export function adminUrlLocaleToDbCode(adminLocale: string): AdminDbLocaleCode {
  const key = adminLocale.toLowerCase();
  return ADMIN_URL_TO_DB_LOCALE[key] ?? "en_US";
}

export function dbLocaleCodeToAdminUrl(code: string): string {
  return ADMIN_DB_TO_URL_LOCALE[code as AdminDbLocaleCode] ?? "en";
}
