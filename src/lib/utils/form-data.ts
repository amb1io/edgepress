/**
 * Utilitários para parsing de FormData com validação e conversão de tipos
 */

/**
 * Extrai uma string do FormData com trim automático
 * @param formData - FormData a ser processado
 * @param key - Chave do campo
 * @param defaultValue - Valor padrão se o campo não existir
 * @returns String processada ou valor padrão
 */
export function getString(formData: FormData, key: string, defaultValue: string = ''): string {
  const value = formData.get(key);
  if (typeof value === 'string') {
    return value.trim();
  }
  return defaultValue;
}

/**
 * Extrai um número do FormData com validação
 * @param formData - FormData a ser processado
 * @param key - Chave do campo
 * @param defaultValue - Valor padrão se o campo não existir ou for inválido
 * @returns Número parseado ou valor padrão
 */
export function getNumber(formData: FormData, key: string, defaultValue: number | null = null): number | null {
  const value = formData.get(key);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return defaultValue;
    }
    const parsed = parseInt(trimmed, 10);
    return Number.isInteger(parsed) ? parsed : defaultValue;
  }
  return defaultValue;
}

/**
 * Extrai um número positivo do FormData com validação
 * @param formData - FormData a ser processado
 * @param key - Chave do campo
 * @param defaultValue - Valor padrão se o campo não existir ou for inválido
 * @returns Número positivo parseado ou valor padrão
 */
export function getPositiveNumber(formData: FormData, key: string, defaultValue: number | null = null): number | null {
  const num = getNumber(formData, key, defaultValue);
  return num !== null && num > 0 ? num : defaultValue;
}

/**
 * Extrai um booleano do FormData
 * @param formData - FormData a ser processado
 * @param key - Chave do campo
 * @param defaultValue - Valor padrão se o campo não existir
 * @returns Booleano parseado
 */
export function getBoolean(formData: FormData, key: string, defaultValue: boolean = false): boolean {
  const value = formData.get(key);
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'on';
  }
  return defaultValue;
}

/**
 * Extrai um array de strings do FormData
 * @param formData - FormData a ser processado
 * @param key - Chave do campo (geralmente com [] no final)
 * @returns Array de strings
 */
export function getArray(formData: FormData, key: string): string[] {
  const values = formData.getAll(key);
  return values
    .filter((v): v is string => typeof v === 'string')
    .map(v => v.trim())
    .filter(v => v !== '');
}

/**
 * Extrai um array de números do FormData com validação
 * @param formData - FormData a ser processado
 * @param key - Chave do campo
 * @param onlyPositive - Se true, filtra apenas números positivos
 * @returns Array de números válidos
 */
export function getNumberArray(formData: FormData, key: string, onlyPositive: boolean = true): number[] {
  const values = formData.getAll(key);
  return values
    .filter((v): v is string => typeof v === 'string')
    .map(v => parseInt(v.trim(), 10))
    .filter(n => Number.isInteger(n) && (onlyPositive ? n > 0 : true));
}

/**
 * Extrai um valor opcional que pode ser null, undefined ou um número
 * Útil para campos como thumbnail_attachment_id que precisam distinguir entre:
 * - Campo não enviado (undefined)
 * - Campo enviado vazio (null)
 * - Campo enviado com valor (number)
 * 
 * @param formData - FormData a ser processado
 * @param key - Chave do campo
 * @returns undefined se não foi enviado, null se foi enviado vazio, ou number se válido
 */
export function getOptionalNumber(formData: FormData, key: string): number | null | undefined {
  const raw = formData.get(key);
  
  // Campo não foi enviado
  if (raw === null) {
    return undefined;
  }
  
  // Campo foi enviado
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    
    // Campo vazio - tratar como null (sem valor)
    if (trimmed === '') {
      return null;
    }
    
    // Tentar parsear como número
    const parsed = parseInt(trimmed, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  
  return null;
}

/**
 * Extrai todos os campos que começam com um prefixo específico
 * Útil para extrair meta_values dinâmicos
 * @param formData - FormData a ser processado
 * @param prefix - Prefixo dos campos (ex: "meta_")
 * @param removePrefix - Se true, remove o prefixo das chaves retornadas
 * @returns Record com os campos encontrados
 */
export function getFieldsWithPrefix(
  formData: FormData,
  prefix: string,
  removePrefix: boolean = true
): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const [key, value] of formData.entries()) {
    if (key.startsWith(prefix) && typeof value === 'string') {
      const finalKey = removePrefix ? key.replace(new RegExp(`^${prefix}`), '') : key;
      result[finalKey] = value.trim();
    }
  }
  
  return result;
}
