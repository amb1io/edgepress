import { sql } from "drizzle-orm";
import type { Database } from "./types/database.ts";
import {
  type KVLike,
  getCacheKvFromLocals,
  isAuthenticatedFromLocals,
} from "./utils/runtime-locals.ts";

export type { KVLike } from "./utils/runtime-locals.ts";

/** Regex para nome de tabela válido (identificador SQL). */
export const VALID_TABLE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Retorna os nomes das tabelas do banco (excluindo tabelas internas sqlite e drizzle).
 * Útil para decidir dinamicamente se o parâmetro "type" da listagem corresponde a uma tabela.
 * @param db - Instância do banco de dados Drizzle
 * @returns Array com os nomes das tabelas do usuário
 */
export async function getTableNames(db: Database): Promise<string[]> {
  const rows = await db.all(
    sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'drizzle%'`
  );
  if (!Array.isArray(rows)) return [];
  return rows.map((row: unknown) => String((row as { name?: string })?.name ?? "")).filter(Boolean);
}

/**
 * Dado um parâmetro de rota e a lista de tabelas permitidas, retorna o nome seguro da tabela ou null.
 * Usado pela API de content para validar [table] e [table]/[id].
 */
export function getSafeTableName(param: string, allowedTables: string[]): string | null {
  if (!VALID_TABLE_IDENTIFIER.test(param) || !allowedTables.includes(param)) return null;
  return param;
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
