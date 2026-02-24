/**
 * System translations by locale.
 * Keys use dot notation (e.g. admin.menu.dashboard).
 * Translations are loaded from the database via API /api/i18n/[locale] with KV cache.
 */
export type Locale = "en" | "es" | "pt-br";

// Import fallback from original JSON files
import enFallback from "./languages/en.json";
import esFallback from "./languages/es.json";
import ptBrFallback from "./languages/pt_br.json";

// In-memory cache to avoid multiple requests
const translationsCache: Record<Locale, Record<string, string> | null> = {
  en: null,
  es: null,
  "pt-br": null,
};

// Fallback translations (using original JSON files if API fails)
const fallbackTranslations: Record<Locale, Record<string, string>> = {
  en: enFallback as Record<string, string>,
  es: esFallback as Record<string, string>,
  "pt-br": ptBrFallback as Record<string, string>,
};

export const defaultLocale: Locale = "pt-br";

export const locales: Locale[] = ["en", "es", "pt-br"];

// Locale to table locale_code mapping
const LOCALE_MAP: Record<string, string> = {
  en: "en_US",
  "en-US": "en_US",
  "en_US": "en_US",
  es: "es_ES",
  "es-ES": "es_ES",
  "es_ES": "es_ES",
  "pt-br": "pt_BR",
  "pt_BR": "pt_BR",
  "pt-BR": "pt_BR",
};

function normalizeLocaleForDB(locale: string): string {
  const normalized = locale.toLowerCase().replace(/-/g, "_");
  return LOCALE_MAP[normalized] || LOCALE_MAP[locale] || locale;
}

/**
 * Loads translations for a locale from the API with cache (for client use)
 */
export async function loadTranslationsFromAPI(locale: Locale, baseUrl: string = ""): Promise<Record<string, string>> {
  // If already cached, return
  if (translationsCache[locale]) {
    return translationsCache[locale]!;
  }

  try {
    // Construir URL da API
    const apiUrl = baseUrl 
      ? `${baseUrl}/api/i18n/${locale}`
      : typeof window !== "undefined"
        ? `/api/i18n/${locale}`
        : `http://localhost:8788/api/i18n/${locale}`;

    // Fazer fetch da API
    const response = await fetch(apiUrl);
    if (response.ok) {
      const data = await response.json() as Record<string, string>;
      // API returns DB + fallback; ensure local merge for keys only in JSON
      const merged = { ...fallbackTranslations[locale], ...data };
      translationsCache[locale] = merged;
      return merged;
    }
  } catch (error) {
    console.warn(`Failed to load translations for locale ${locale}:`, error);
  }

  // Return fallback if API fails
  return fallbackTranslations[locale];
}

/**
 * Loads translations for a locale directly from the database (for server use)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadTranslationsFromDB(
  locale: Locale,
  db: any,
  localesTable: any,
  translationsTable: any,
  translationsLanguagesTable: any,
  eq: any
): Promise<Record<string, string>> {
  // If already cached, return
  if (translationsCache[locale]) {
    return translationsCache[locale]!;
  }

  try {
    const dbLocaleCode = normalizeLocaleForDB(locale);
    
    // Fetch locale ID
    const [localeRow] = await db.select({ id: localesTable.id })
      .from(localesTable)
      .where(eq(localesTable.locale_code, dbLocaleCode))
      .limit(1) as Array<{ id: number } | undefined>;

    if (!localeRow) {
      return fallbackTranslations[locale];
    }

    // Fetch all translations for this locale
    const translationsData = await db.select({
      namespace: translationsTable.namespace,
      key: translationsTable.key,
      value: translationsLanguagesTable.value,
    })
      .from(translationsLanguagesTable)
      .innerJoin(translationsTable, eq(translationsLanguagesTable.id_translations, translationsTable.id))
      .where(eq(translationsLanguagesTable.id_locale_code, localeRow.id)) as Array<{
      namespace: string;
      key: string;
      value: string;
    }>;

    // Transform to key-value object format
    const translationsMap: Record<string, string> = {};
    for (const row of translationsData) {
      const fullKey = row.namespace ? `${row.namespace}.${row.key}` : row.key;
      translationsMap[fullKey] = row.value;
    }

    // DB overwrites fallback; keys only in JSON remain available
    const merged = { ...fallbackTranslations[locale], ...translationsMap };
    translationsCache[locale] = merged;
    return merged;
  } catch (error) {
    console.warn(`Failed to load translations from DB for locale ${locale}:`, error);
    return fallbackTranslations[locale];
  }
}

/**
 * Carrega traduções de um locale (tenta API primeiro, depois DB se disponível)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadTranslations(
  locale: Locale,
  options?: {
    baseUrl?: string;
    db?: any;
    localesTable?: any;
    translationsTable?: any;
    translationsLanguagesTable?: any;
    eq?: any;
  }
): Promise<Record<string, string>> {
  // If already cached, return
  if (translationsCache[locale]) {
    return translationsCache[locale]!;
  }

  // If we have DB access (server), use DB directly
  if (options?.db && options?.localesTable && options?.translationsTable && options?.translationsLanguagesTable && options?.eq) {
    return loadTranslationsFromDB(
      locale,
      options.db,
      options.localesTable,
      options.translationsTable,
      options.translationsLanguagesTable,
      options.eq
    );
  }

  // Otherwise use API
  return loadTranslationsFromAPI(locale, options?.baseUrl);
}

/**
 * Invalidates the in-memory translations cache.
 * Call after creating/editing post types or translations so the next load uses DB/API data.
 * @param locale - If provided, invalidates only that locale; otherwise invalidates all.
 */
export function invalidateTranslationsCache(locale?: Locale): void {
  if (locale !== undefined) {
    translationsCache[locale] = null;
    return;
  }
  translationsCache.en = null;
  translationsCache.es = null;
  translationsCache["pt-br"] = null;
}

/**
 * Gets translations for a locale (synchronous when possible, async when needed)
 */
export function getTranslations(locale: Locale): Record<string, string> {
  // If cached, use cache; otherwise use fallback from JSON files
  const cached = translationsCache[locale];
  if (cached && Object.keys(cached).length > 0) {
    return cached;
  }
  return fallbackTranslations[locale];
}

/**
 * Exports translations for compatibility (using cache or fallback)
 */
export const translations: Record<Locale, Record<string, string>> = {
  get en() {
    return getTranslations("en");
  },
  get es() {
    return getTranslations("es");
  },
  get "pt-br"() {
    return getTranslations("pt-br");
  },
};
