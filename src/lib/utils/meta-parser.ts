/**
 * Utilitários para parsing e manipulação de meta_values
 * Consolida a lógica duplicada em attachment.astro, content.astro e posts.ts
 */

/**
 * Parseia uma string JSON de meta_values para um objeto Record
 * @param metaValues - String JSON com os meta valores ou null
 * @returns Record<string, string> com os valores parseados, ou objeto vazio se inválido
 */
export function parseMetaValues(metaValues: string | null): Record<string, string> {
  if (!metaValues) {
    return {};
  }
  
  try {
    const parsed = JSON.parse(metaValues);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Falha silenciosa, retorna objeto vazio
  }
  
  return {};
}

/**
 * Mescla meta_values existentes com novos valores
 * Valores novos sobrescrevem valores existentes
 * @param existingMetaValues - String JSON com valores existentes
 * @param newValues - Record com novos valores a serem mesclados
 * @returns String JSON com valores mesclados, ou null se não houver valores
 */
export function mergeMetaValues(
  existingMetaValues: string | null,
  newValues: Record<string, string>
): string | null {
  const existing = parseMetaValues(existingMetaValues);
  const merged = { ...existing, ...newValues };
  
  // Se não houver valores após merge, retornar null
  if (Object.keys(merged).length === 0) {
    return null;
  }
  
  return JSON.stringify(merged);
}

/**
 * Obtém um valor específico dos meta_values
 * @param metaValues - String JSON com os meta valores
 * @param key - Chave do valor a ser extraído
 * @param defaultValue - Valor padrão se a chave não existir
 * @returns Valor da chave ou valor padrão
 */
export function getMetaValue(
  metaValues: string | null,
  key: string,
  defaultValue: string | null = null
): string | null {
  const parsed = parseMetaValues(metaValues);
  return parsed[key] ?? defaultValue;
}

/**
 * Remove uma chave específica dos meta_values
 * @param metaValues - String JSON com os meta valores
 * @param key - Chave a ser removida
 * @returns String JSON atualizada ou null se vazio
 */
export function removeMetaValue(metaValues: string | null, key: string): string | null {
  const parsed = parseMetaValues(metaValues);
  delete parsed[key];
  
  if (Object.keys(parsed).length === 0) {
    return null;
  }
  
  return JSON.stringify(parsed);
}

/**
 * Define um valor específico nos meta_values
 * @param metaValues - String JSON com os meta valores
 * @param key - Chave a ser definida
 * @param value - Valor a ser atribuído
 * @returns String JSON atualizada
 */
export function setMetaValue(
  metaValues: string | null,
  key: string,
  value: string
): string {
  const parsed = parseMetaValues(metaValues);
  parsed[key] = value;
  return JSON.stringify(parsed);
}

/**
 * Verifica se uma chave existe nos meta_values
 * @param metaValues - String JSON com os meta valores
 * @param key - Chave a ser verificada
 * @returns true se a chave existe, false caso contrário
 */
export function hasMetaValue(metaValues: string | null, key: string): boolean {
  const parsed = parseMetaValues(metaValues);
  return key in parsed;
}

/**
 * Converte um Record para string JSON de meta_values
 * @param values - Record com valores a serem convertidos
 * @returns String JSON ou null se vazio
 */
export function stringifyMetaValues(values: Record<string, string>): string | null {
  if (Object.keys(values).length === 0) {
    return null;
  }
  return JSON.stringify(values);
}
