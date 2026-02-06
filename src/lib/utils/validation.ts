/**
 * Utilitários de validação para IDs e outros valores comuns
 */

/**
 * Verifica se um ID é um número inteiro positivo válido
 * @param id - ID a ser validado (string ou null)
 * @returns true se o ID é válido, false caso contrário
 */
export function isValidNumericId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  
  return /^\d+$/.test(id);
}

/**
 * Parseia um ID numérico e valida se é um inteiro positivo
 * @param id - ID a ser parseado (string ou null)
 * @returns Número parseado ou null se inválido
 */
export function parseNumericId(id: string | null | undefined): number | null {
  if (!isValidNumericId(id)) {
    return null;
  }
  
  const parsed = parseInt(id as string, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Verifica se um ID é um UUID válido
 * @param id - ID a ser validado
 * @returns true se o ID é um UUID válido, false caso contrário
 */
export function isValidUserId(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  
  // Regex para UUID v4
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Valida um slug (formato URL-friendly)
 * @param slug - Slug a ser validado
 * @returns true se o slug é válido, false caso contrário
 */
export function isValidSlug(slug: string | null | undefined): boolean {
  if (!slug || typeof slug !== 'string') {
    return false;
  }
  
  // Slug deve conter apenas letras minúsculas, números e hífens
  // Não pode começar ou terminar com hífen
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugRegex.test(slug);
}

/**
 * Valida um email
 * @param email - Email a ser validado
 * @returns true se o email é válido, false caso contrário
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // Regex básica para email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Valida um locale
 * @param locale - Locale a ser validado
 * @param validLocales - Array de locales válidos
 * @returns true se o locale é válido, false caso contrário
 */
export function isValidLocale(locale: string | null | undefined, validLocales: string[] = ['pt-br', 'en']): boolean {
  if (!locale || typeof locale !== 'string') {
    return false;
  }
  
  return validLocales.includes(locale.toLowerCase());
}

/**
 * Valida um status de post
 * @param status - Status a ser validado
 * @returns true se o status é válido, false caso contrário
 */
export function isValidPostStatus(status: string | null | undefined): boolean {
  if (!status || typeof status !== 'string') {
    return false;
  }
  
  const validStatuses = ['published', 'draft', 'archived'];
  return validStatuses.includes(status.toLowerCase());
}

/**
 * Normaliza um status de post para um valor válido
 * @param status - Status a ser normalizado
 * @param defaultStatus - Status padrão se o valor for inválido
 * @returns Status normalizado
 */
export function normalizePostStatus(status: string | null | undefined, defaultStatus: 'draft' | 'published' | 'archived' = 'draft'): 'draft' | 'published' | 'archived' {
  if (isValidPostStatus(status)) {
    return status as 'draft' | 'published' | 'archived';
  }
  return defaultStatus;
}

/**
 * Valida se uma string não está vazia após trim
 * @param value - Valor a ser validado
 * @returns true se a string não está vazia, false caso contrário
 */
export function isNonEmptyString(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Valida se um array não está vazio
 * @param array - Array a ser validado
 * @returns true se o array não está vazio, false caso contrário
 */
export function isNonEmptyArray<T>(array: T[] | null | undefined): boolean {
  return Array.isArray(array) && array.length > 0;
}
