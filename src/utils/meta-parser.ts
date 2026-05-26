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

type MetaSchemaItem = { key: string; default?: unknown };

/**
 * Obtém uma opção do meta_schema de um post type (array de { key, default? }).
 * Usado para taxonomy, post_thumbnail, post_types, etc.
 * @param metaSchema - meta_schema do post type (array ou null/undefined)
 * @param key - Chave do item (ex: "taxonomy", "post_thumbnail", "post_types")
 * @param defaultValue - Valor padrão se a chave não existir ou tipo incompatível
 * @returns Valor da opção ou defaultValue
 */
export function getMetaSchemaOption<T>(metaSchema: unknown, key: string, defaultValue: T): T {
  const schema = (Array.isArray(metaSchema) ? metaSchema : []) as MetaSchemaItem[];
  const item = schema.find((s) => s.key === key);
  const def = item?.default;
  if (def === undefined) return defaultValue;
  return def as T;
}

/**
 * Retorna os tipos de taxonomia do meta_schema (array de strings). Default: ["category"].
 */
export function getMetaSchemaTaxonomyTypes(metaSchema: unknown): string[] {
  const def = getMetaSchemaOption<unknown>(metaSchema, "taxonomy", ["category"]);
  return Array.isArray(def) ? (def as string[]) : ["category"];
}

/**
 * Retorna se o post type tem post_thumbnail habilitado. Default: false.
 */
export function getMetaSchemaPostThumbnail(metaSchema: unknown): boolean {
  const def = getMetaSchemaOption<unknown>(metaSchema, "post_thumbnail", false);
  return typeof def === "boolean" ? def : false;
}

/**
 * Retorna se o post type tem custom_fields (post_types inclui "custom_fields"). Default: false.
 */
export function getMetaSchemaHasCustomFields(metaSchema: unknown): boolean {
  const def = getMetaSchemaOption<unknown>(metaSchema, "post_types", []);
  return Array.isArray(def) && def.includes("custom_fields");
}
