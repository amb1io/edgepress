/**
 * Prefixo das tabelas no banco (estilo `wp_` do WordPress).
 * Nomes físicos: `edp_posts`. APIs e rotas usam o nome lógico: `posts`.
 */
export const TABLE_PREFIX = "edp_" as const;

/** Nome físico da tabela no SQLite/D1. */
export function prefixedTable(logicalName: string): string {
  return `${TABLE_PREFIX}${logicalName}`;
}

/** Nome lógico (API/rotas) a partir do nome físico. */
export function stripTablePrefix(physicalName: string): string {
  return physicalName.startsWith(TABLE_PREFIX)
    ? physicalName.slice(TABLE_PREFIX.length)
    : physicalName;
}
