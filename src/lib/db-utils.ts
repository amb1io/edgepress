import { sql } from "drizzle-orm";
import type { Database } from "./types/database.ts";

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
  return rows.map((row: { name?: string }) => String(row?.name ?? "")).filter(Boolean);
}
