/**
 * Locales fixos do admin (URL ↔ código no banco) e união com site_locales (settings).
 */
import { eq, inArray } from "drizzle-orm";
import { locales, settings } from "../db/schema.ts";
import {
  ADMIN_DB_LOCALE_CODES,
  type AdminDbLocaleCode,
} from "./admin-locale-constants.ts";

export {
  ADMIN_URL_LOCALES,
  ADMIN_DB_LOCALE_CODES,
  ADMIN_URL_TO_DB_LOCALE,
  ADMIN_DB_TO_URL_LOCALE,
  type AdminDbLocaleCode,
  adminUrlLocaleToDbCode,
  dbLocaleCodeToAdminUrl,
} from "./admin-locale-constants.ts";

export type CategoryTranslationLocale = {
  id: number;
  locale_code: string;
  language: string;
  hello_world: string;
  country: string;
  isAdminLocale: boolean;
};

export function localeCodeFlag(localeCode: string): string {
  const flagMap: Record<string, string> = {
    en_us: "🇺🇸",
    en: "🇺🇸",
    "en-gb": "🇬🇧",
    pt_br: "🇧🇷",
    "pt-br": "🇧🇷",
    "pt-pt": "🇵🇹",
    es_es: "🇪🇸",
    es: "🇪🇸",
    "es-mx": "🇲🇽",
    fr: "🇫🇷",
    de: "🇩🇪",
  };
  const code = localeCode.toLowerCase().replace(/-/g, "_");
  const hyphen = localeCode.toLowerCase();
  const base = code.split("_")[0] ?? code;
  return flagMap[code] || flagMap[hyphen] || flagMap[base] || "🌐";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** IDs em `settings.site_locales` (lista separada por vírgula). */
export async function getSiteLocaleIdsFromSettings(db: Db): Promise<number[]> {
  try {
    const [row] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.name, "site_locales"))
      .limit(1);
    const raw = String(row?.value ?? "").trim();
    if (!raw) return [];
    return [
      ...new Set(
        raw
          .split(",")
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n) && n > 0)
      ),
    ];
  } catch {
    return [];
  }
}

/**
 * Locales para traduções de categoria: site_locales + idiomas fixos do admin (sem duplicar).
 * Ordem: pt_BR, es_ES, en_US; depois extras do site por nome do idioma.
 */
export async function resolveCategoryTranslationLocales(
  db: Db
): Promise<CategoryTranslationLocale[]> {
  const siteIds = await getSiteLocaleIdsFromSettings(db);
  const adminCodes = [...ADMIN_DB_LOCALE_CODES];

  const adminRows = (await db
    .select({
      id: locales.id,
      locale_code: locales.locale_code,
      language: locales.language,
      hello_world: locales.hello_world,
      country: locales.country,
    })
    .from(locales)
    .where(inArray(locales.locale_code, adminCodes))) as CategoryTranslationLocale[];

  const adminByCode = new Map(adminRows.map((r) => [r.locale_code, r]));
  const byId = new Map<number, CategoryTranslationLocale>();

  for (const code of adminCodes) {
    const row = adminByCode.get(code);
    if (row) {
      byId.set(row.id, { ...row, isAdminLocale: true });
    }
  }

  if (siteIds.length > 0) {
    const siteRows = (await db
      .select({
        id: locales.id,
        locale_code: locales.locale_code,
        language: locales.language,
        hello_world: locales.hello_world,
        country: locales.country,
      })
      .from(locales)
      .where(inArray(locales.id, siteIds))) as CategoryTranslationLocale[];

    for (const row of siteRows) {
      if (!byId.has(row.id)) {
        byId.set(row.id, {
          ...row,
          isAdminLocale: ADMIN_DB_LOCALE_CODES.includes(
            row.locale_code as AdminDbLocaleCode
          ),
        });
      }
    }
  }

  const adminOrdered = adminCodes
    .map((code) => adminByCode.get(code))
    .filter((r): r is CategoryTranslationLocale => Boolean(r))
    .map((r) => ({ ...r, isAdminLocale: true }));

  const adminIdSet = new Set(adminOrdered.map((r) => r.id));
  const extras = [...byId.values()]
    .filter((r) => !adminIdSet.has(r.id))
    .sort((a, b) => a.language.localeCompare(b.language));

  return [...adminOrdered, ...extras];
}

/** IDs permitidos para dropdowns de tradução (site + admin). */
export async function resolveCategoryTranslationLocaleIds(db: Db): Promise<number[]> {
  const rows = await resolveCategoryTranslationLocales(db);
  return rows.map((r) => r.id);
}
