/**
 * System translations by locale.
 * Keys use dot notation (e.g. admin.menu.dashboard).
 * Translations are loaded from the database via API /api/i18n/[locale] with KV cache.
 */
export type Locale = "en" | "es" | "pt-br";

// Importar fallback dos arquivos JSON originais
import enFallback from "./languages/en.json";
import esFallback from "./languages/es.json";
import ptBrFallback from "./languages/pt_br.json";

// Cache em memória para evitar múltiplas requisições
const translationsCache: Record<Locale, Record<string, string> | null> = {
  en: null,
  es: null,
  "pt-br": null,
};

// Fallback translations (usando arquivos JSON originais caso a API falhe)
const fallbackTranslations: Record<Locale, Record<string, string>> = {
  en: enFallback as Record<string, string>,
  es: esFallback as Record<string, string>,
  "pt-br": ptBrFallback as Record<string, string>,
};

export const defaultLocale: Locale = "pt-br";

export const locales: Locale[] = ["en", "es", "pt-br"];

// Mapeamento de locales para locale_code da tabela
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
 * Carrega traduções de um locale da API com cache (para uso no cliente)
 */
export async function loadTranslationsFromAPI(locale: Locale, baseUrl: string = ""): Promise<Record<string, string>> {
  // Se já está em cache, retornar
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
      translationsCache[locale] = data;
      return data;
    }
  } catch (error) {
    console.warn(`Failed to load translations for locale ${locale}:`, error);
  }

  // Retornar fallback se a API falhar
  return fallbackTranslations[locale];
}

/**
 * Carrega traduções de um locale diretamente do banco de dados (para uso no servidor)
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
  // Se já está em cache, retornar
  if (translationsCache[locale]) {
    return translationsCache[locale]!;
  }

  try {
    const dbLocaleCode = normalizeLocaleForDB(locale);
    
    // Buscar o ID do locale
    const [localeRow] = await db.select({ id: localesTable.id })
      .from(localesTable)
      .where(eq(localesTable.locale_code, dbLocaleCode))
      .limit(1) as Array<{ id: number } | undefined>;

    if (!localeRow) {
      return fallbackTranslations[locale];
    }

    // Buscar todas as traduções para este locale
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

    // Transformar em formato de objeto chave-valor
    const translationsMap: Record<string, string> = {};
    for (const row of translationsData) {
      const fullKey = row.namespace ? `${row.namespace}.${row.key}` : row.key;
      translationsMap[fullKey] = row.value;
    }

    translationsCache[locale] = translationsMap;
    return translationsMap;
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
  // Se já está em cache, retornar
  if (translationsCache[locale]) {
    return translationsCache[locale]!;
  }

  // Se temos acesso ao DB (servidor), usar DB diretamente
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

  // Caso contrário, usar API
  return loadTranslationsFromAPI(locale, options?.baseUrl);
}

/**
 * Obtém traduções de um locale (síncrono quando possível, assíncrono quando necessário)
 */
export function getTranslations(locale: Locale): Record<string, string> {
  // Se tem cache, usar cache; caso contrário, usar fallback dos arquivos JSON
  const cached = translationsCache[locale];
  if (cached && Object.keys(cached).length > 0) {
    return cached;
  }
  return fallbackTranslations[locale];
}

/**
 * Exporta traduções para compatibilidade (usando cache ou fallback)
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
