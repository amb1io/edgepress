/**
 * Utilitários para manipulação de locales
 */

/**
 * Locales suportados pelo sistema
 */
export const SUPPORTED_LOCALES = ['pt-br', 'en', 'es'] as const;

export type Locale = typeof SUPPORTED_LOCALES[number];

/**
 * Locale padrão do sistema
 */
export const DEFAULT_LOCALE: Locale = 'pt-br';

/**
 * Valida se um locale é suportado
 * @param locale - Locale a ser validado
 * @returns Locale válido ou null se inválido
 */
export function validateLocale(locale: string | null | undefined): Locale | null {
  if (!locale || typeof locale !== 'string') {
    return null;
  }
  
  const normalized = locale.toLowerCase().trim();
  
  if (SUPPORTED_LOCALES.includes(normalized as Locale)) {
    return normalized as Locale;
  }
  
  return null;
}

/**
 * Normaliza um locale para um valor válido, retornando o padrão se inválido
 * @param locale - Locale a ser normalizado
 * @returns Locale normalizado
 */
export function normalizeLocale(locale: string | null | undefined): Locale {
  const validated = validateLocale(locale);
  return validated ?? DEFAULT_LOCALE;
}

/**
 * Retorna o locale padrão
 * @returns Locale padrão
 */
export function getDefaultLocale(): Locale {
  return DEFAULT_LOCALE;
}

/**
 * Verifica se um locale é válido
 * @param locale - Locale a ser verificado
 * @returns true se válido, false caso contrário
 */
export function isValidLocale(locale: string | null | undefined): locale is Locale {
  return validateLocale(locale) !== null;
}

/**
 * Extrai o locale de uma URL
 * Assume que o locale está no primeiro segmento da URL (ex: /pt-br/admin/...)
 * @param url - URL a ser analisada
 * @returns Locale extraído ou null se não encontrado
 */
export function extractLocaleFromUrl(url: string): Locale | null {
  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    
    if (pathSegments.length > 0) {
      return validateLocale(pathSegments[0]);
    }
  } catch {
    // URL inválida
  }
  
  return null;
}

/**
 * Extrai o locale de um pathname
 * @param pathname - Pathname a ser analisado
 * @returns Locale extraído ou null se não encontrado
 */
export function extractLocaleFromPathname(pathname: string): Locale | null {
  const pathSegments = pathname.split('/').filter(Boolean);
  
  if (pathSegments.length > 0) {
    return validateLocale(pathSegments[0]);
  }
  
  return null;
}

/**
 * Mapa de nomes de locales
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  'pt-br': 'Português (Brasil)',
  'en': 'English',
  'es': 'Español',
};

/**
 * Retorna o nome de exibição de um locale
 * @param locale - Locale
 * @returns Nome de exibição
 */
export function getLocaleName(locale: Locale): string {
  return LOCALE_NAMES[locale] ?? locale;
}

/**
 * Retorna todos os locales suportados com seus nomes
 * @returns Array de objetos com locale e nome
 */
export function getSupportedLocales(): Array<{ locale: Locale; name: string }> {
  return SUPPORTED_LOCALES.map(locale => ({
    locale,
    name: getLocaleName(locale),
  }));
}
