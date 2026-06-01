/**
 * Prefixo das tabelas no banco (estilo `wp_` do WordPress).
 * Nomes físicos: `edp_posts`. APIs e rotas usam o nome lógico: `posts`.
 */
export const TABLE_PREFIX = "edp_" as const;

/** Nomes lógicos das tabelas EdgePress (sem prefixo). */
export const EDP_LOGICAL_TABLES = [
  "post_types",
  "posts",
  "posts_media",
  "posts_taxonomies",
  "taxonomies",
  "settings",
  "role_capability",
  "locales",
  "translations",
  "translations_languages",
  "user",
  "session",
  "account",
  "verification",
] as const;

export type EdpLogicalTable = (typeof EDP_LOGICAL_TABLES)[number];

/** Retorna o nome físico da tabela no banco (`edp_posts`, etc.). */
export function tableName(name: EdpLogicalTable | string): string {
  return `${TABLE_PREFIX}${name}`;
}

/** Retorna o nome físico de um índice/constraint. */
export function indexName(name: string): string {
  return `${TABLE_PREFIX}${name}`;
}

/** Mapa lógico → físico. */
export const EDP_TABLES = Object.fromEntries(
  EDP_LOGICAL_TABLES.map((name) => [name, tableName(name)]),
) as Record<EdpLogicalTable, string>;

/** Remove o prefixo para expor nome lógico em APIs. */
export function logicalTableName(physical: string): string {
  return physical.startsWith(TABLE_PREFIX)
    ? physical.slice(TABLE_PREFIX.length)
    : physical;
}

/** Resolve parâmetro de rota/API (lógico ou físico) para nome físico. */
export function resolvePhysicalTableName(param: string): string | null {
  if ((EDP_LOGICAL_TABLES as readonly string[]).includes(param)) {
    return tableName(param);
  }
  if (param.startsWith(TABLE_PREFIX)) {
    const logical = logicalTableName(param);
    if ((EDP_LOGICAL_TABLES as readonly string[]).includes(logical)) {
      return param;
    }
  }
  return null;
}

/** Alias legado de `tableName`. */
export const prefixedTable = tableName;

/** Alias legado de `logicalTableName`. */
export const stripTablePrefix = logicalTableName;
