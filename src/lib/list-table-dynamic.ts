/**
 * Listagem dinâmica por nome de tabela.
 * Quando type = nome de uma tabela do banco, lista as linhas dessa tabela com ordenação, filtro e paginação.
 */
import { sql } from "drizzle-orm";
import type { Database } from "./types/database.ts";

const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function safeIdentifier(name: string): string | null {
  return VALID_IDENTIFIER.test(name) ? name : null;
}

export type GetTableListParams = {
  order?: string;
  orderDir?: "asc" | "desc";
  limit?: number;
  page?: number;
  filter?: Record<string, string>;
};

export type GetTableListResult = {
  items: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  columns: string[];
};

function escapeSqliteString(value: string): string {
  return value.replace(/'/g, "''");
}

function escapeIdentifier(name: string): string {
  return name.replace(/"/g, '""');
}

/**
 * Retorna os nomes das colunas da tabela (via PRAGMA table_info).
 */
export async function getTableColumns(db: Database, tableName: string): Promise<string[]> {
  const safe = safeIdentifier(tableName);
  if (!safe) return [];
  const rows = await db.all(
    sql.raw(`PRAGMA table_info("${escapeIdentifier(safe)}")`)
  ) as { name?: string }[];
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => String(r?.name ?? "")).filter(Boolean);
}

/**
 * Mapa opcional: nome da tabela -> template de delete (ex: "/api/users/{id}").
 * Tabelas não listadas não exibem botão de deletar ou usam template vazio.
 */
export const TABLE_DELETE_TEMPLATE: Record<string, string> = {
  user: "/api/users/{id}",
  settings: "/api/settings/{id}",
  posts: "/api/posts/{id}",
};

/**
 * Lista linhas de uma tabela com ordenação, filtro e paginação.
 * tableName e order são validados contra identificadores seguros; filtros só em colunas existentes.
 */
export async function getTableList(
  db: Database,
  tableName: string,
  params: GetTableListParams = {}
): Promise<GetTableListResult> {
  const safeTable = safeIdentifier(tableName);
  if (!safeTable) {
    return { items: [], total: 0, page: 1, limit: 10, totalPages: 0, columns: [] };
  }

  const columns = await getTableColumns(db, tableName);
  if (columns.length === 0) {
    return { items: [], total: 0, page: 1, limit: 10, totalPages: 0, columns: [] };
  }

  const limit = Math.min(100, Math.max(1, params.limit ?? 10));
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * limit;
  const orderDir = params.orderDir === "asc" ? "ASC" : "DESC";
  const orderCol = params.order && columns.includes(params.order) ? params.order : columns[0];
  const filter = params.filter ?? {};

  const filterCols = Object.keys(filter).filter((k) => columns.includes(k) && filter[k]);
  const whereParts: string[] = [];
  for (const col of filterCols) {
    const escaped = escapeSqliteString(filter[col]);
    whereParts.push(`"${escapeIdentifier(col)}" LIKE '%${escaped}%'`);
  }
  const whereSql = whereParts.length > 0 ? ` WHERE ${whereParts.join(" AND ")}` : "";
  const quotedTable = `"${escapeIdentifier(safeTable)}"`;
  const quotedOrderCol = `"${escapeIdentifier(orderCol)}"`;

  const countQuery = sql.raw(
    `SELECT count(*) as c FROM ${quotedTable}${whereSql}`
  );
  const countResult = await db.all(countQuery) as { c?: number }[];
  const total = Number(countResult?.[0]?.c ?? 0);

  const orderSql = `ORDER BY ${quotedOrderCol} ${orderDir}`;
  const selectQuery = sql.raw(
    `SELECT * FROM ${quotedTable}${whereSql} ${orderSql} LIMIT ${limit} OFFSET ${offset}`
  );
  const rows = await db.all(selectQuery) as Record<string, unknown>[];

  return {
    items: Array.isArray(rows) ? rows : [],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    columns,
  };
}
