import { sql } from "drizzle-orm";
import type { Database } from "./types/database.ts";
import {
  TABLE_PREFIX,
  EDP_LOGICAL_TABLES,
  logicalTableName,
  resolvePhysicalTableName,
} from "../db/table-prefix.ts";
import {
  type KVLike,
  getCacheKvFromLocals,
  isAuthenticatedFromLocals,
} from "./utils/runtime-locals.ts";

export type { KVLike } from "./utils/runtime-locals.ts";

/** Regex para nome de tabela válido (identificador SQL). */
export const VALID_TABLE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Tipos de URL que mapeiam para tabelas de schema (auth/config), nunca para posts. */
export const LOGICAL_TABLE_TYPES = ["user", "settings"] as const;

/**
 * Resolve o nome físico da tabela no SQLite a partir do tipo lógico da URL.
 * Aceita nome exato (ex.: user) ou prefixado (ex.: edp_user).
 */
export function findPhysicalTableName(
  logicalName: string,
  tableNames: string[],
): string | null {
  if (tableNames.includes(logicalName)) return logicalName;
  const suffixed = tableNames.filter((name) => name.endsWith(`_${logicalName}`));
  if (suffixed.length === 1) return suffixed[0]!;
  if (suffixed.length > 1) {
    return suffixed.find((name) => name !== logicalName) ?? suffixed[0]!;
  }
  return null;
}

/**
 * Retorna o nome físico da tabela para listagem dinâmica, ou null se o tipo não for tabela.
 */
export function resolveTableName(type: string, tableNames: string[]): string | null {
  if ((LOGICAL_TABLE_TYPES as readonly string[]).includes(type)) {
    return findPhysicalTableName(type, tableNames);
  }
  return tableNames.includes(type) ? type : null;
}

/**
 * Retorna os nomes das tabelas do banco (excluindo tabelas internas sqlite e drizzle).
 * Útil para decidir dinamicamente se o parâmetro "type" da listagem corresponde a uma tabela.
 * @param db - Instância do banco de dados Drizzle
 * @returns Array com os nomes das tabelas do usuário
 */
export async function getTableNames(db: Database): Promise<string[]> {
  const rows = await db.all(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'drizzle%' AND name NOT LIKE 'd1_%'`
  );
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row: unknown) => String((row as { name?: string })?.name ?? ""))
    .filter((name) => name.startsWith(TABLE_PREFIX))
    .map((name) => logicalTableName(name))
    .filter((name) => (EDP_LOGICAL_TABLES as readonly string[]).includes(name));
}

export { prefixedTable, stripTablePrefix, TABLE_PREFIX } from "../db/table-prefix.ts";

/**
 * Dado um parâmetro de rota e a lista de tabelas permitidas, retorna o nome seguro da tabela ou null.
 * Usado pela API de content para validar [table] e [table]/[id].
 */
export function getSafeTableName(param: string, allowedTables: string[]): string | null {
  if (!VALID_TABLE_IDENTIFIER.test(param) || !allowedTables.includes(param)) return null;
  return resolvePhysicalTableName(param);
}

/**
 * Escapa um identificador para uso em SQL bruto (ex.: nome de tabela).
 * Usado apenas quando o nome já foi validado com getSafeTableName.
 */
export function escapeIdentifier(name: string): string {
  return name.replace(/"/g, '""');
}

/**
 * Extrai autenticação e instância de cache KV dos locals da rota (API de content).
 * Autenticado: bypass de cache; não autenticado: usa KV quando disponível.
 */
export function getContentApiRuntime(locals: App.Locals): { isAuthenticated: boolean; kv: KVLike | null } {
  return {
    isAuthenticated: isAuthenticatedFromLocals(locals),
    kv: getCacheKvFromLocals(locals),
  };
}
