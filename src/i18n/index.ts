import { type Locale, translations, defaultLocale, locales, loadTranslations } from "./translations.ts";

/**
 * Get translated string for a key in the given locale.
 * Placeholders like {name} are replaced with the values from the second argument.
 * 
 * Esta função funciona de forma síncrona, usando o cache de traduções.
 * As traduções devem ser pré-carregadas usando loadTranslations() quando necessário.
 */
export function t(
  locale: string,
  key: string,
  params?: Record<string, string | number>
): string {
  const normalizedLocale = normalizeLocale(locale);
  const dict = translations[normalizedLocale as Locale] ?? translations[defaultLocale];
  
  // Tentar encontrar a tradução
  let value = dict[key];
  
  // Se não encontrou, tentar no locale padrão
  if (!value || value === key) {
    value = translations[defaultLocale][key];
  }
  
  // Se ainda não encontrou, usar a chave como fallback
  if (!value || value === key) {
    value = key;
  }
  
  // Substituir placeholders
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  
  return value;
}

/**
 * Pré-carrega traduções para um locale específico.
 * Útil para garantir que as traduções estão disponíveis antes de usar a função t().
 * 
 * No servidor, pode passar opções com db para carregar diretamente do banco.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function preloadTranslations(
  locale: string,
  options?: {
    baseUrl?: string;
    db?: any;
    localesTable?: any;
    translationsTable?: any;
    translationsLanguagesTable?: any;
    eq?: any;
  }
): Promise<void> {
  const normalizedLocale = normalizeLocale(locale) as Locale;
  await loadTranslations(normalizedLocale, options);
}

function normalizeLocale(locale: string): string {
  const lower = locale.toLowerCase();
  if (lower === "pt-br" || lower === "pt_br") return "pt-br";
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("es")) return "es";
  return lower;
}

export { translations, defaultLocale, locales, loadTranslations, preloadTranslations };
export type { Locale };
