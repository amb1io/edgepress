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
 * Retorna informações sobre Foreign Keys de uma tabela (via PRAGMA foreign_key_list).
 */
async function getForeignKeys(db: Database, tableName: string): Promise<Array<{ column: string; referencedTable: string; referencedColumn: string }>> {
  const safe = safeIdentifier(tableName);
  if (!safe) return [];
  const rows = await db.all(
    sql.raw(`PRAGMA foreign_key_list("${escapeIdentifier(safe)}")`)
  ) as Array<{ id?: number; seq?: number; table?: string; from?: string; to?: string; on_update?: string; on_delete?: string; match?: string }>;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    column: String(r?.from ?? ""),
    referencedTable: String(r?.table ?? ""),
    referencedColumn: String(r?.to ?? ""),
  })).filter((fk) => fk.column && fk.referencedTable && fk.referencedColumn);
}

/**
 * Retorna campos de texto (TEXT) de uma tabela.
 */
async function getTextColumns(db: Database, tableName: string): Promise<string[]> {
  const safe = safeIdentifier(tableName);
  if (!safe) return [];
  const rows = await db.all(
    sql.raw(`PRAGMA table_info("${escapeIdentifier(safe)}")`)
  ) as Array<{ name?: string; type?: string }>;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => {
      const type = String(r?.type ?? "").toUpperCase();
      return type.includes("TEXT") || type === "VARCHAR" || type === "CHAR";
    })
    .map((r) => String(r?.name ?? ""))
    .filter(Boolean);
}

/**
 * Retorna informações sobre tabelas relacionadas via Foreign Keys e seus campos de texto.
 */
export async function getRelatedTableInfo(
  db: Database,
  tableName: string
): Promise<Array<{ table: string; fkColumn: string; refColumn: string; textColumns: string[] }>> {
  const safe = safeIdentifier(tableName);
  if (!safe) return [];
  
  const foreignKeys = await getForeignKeys(db, tableName);
  const relatedInfo: Array<{ table: string; fkColumn: string; refColumn: string; textColumns: string[] }> = [];
  
  for (const fk of foreignKeys) {
    const textColumns = await getTextColumns(db, fk.referencedTable);
    if (textColumns.length > 0) {
      relatedInfo.push({
        table: fk.referencedTable,
        fkColumn: fk.column,
        refColumn: fk.referencedColumn,
        textColumns,
      });
    }
  }
  
  return relatedInfo;
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
 * Inclui campos de texto de tabelas relacionadas via Foreign Keys.
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

  // Buscar informações sobre tabelas relacionadas
  const relatedInfo = await getRelatedTableInfo(db, tableName);
  
  // Buscar campos de texto da tabela principal
  const mainTextColumns = await getTextColumns(db, tableName);
  
  // Construir lista de colunas para SELECT (incluindo campos de texto relacionados)
  const selectColumns: string[] = [];
  const displayColumns: string[] = [];
  
  // Adicionar todas as colunas da tabela principal
  const quotedTable = `"${escapeIdentifier(safeTable)}"`;
  selectColumns.push(`${quotedTable}.*`);
  displayColumns.push(...columns);
  
  // Adicionar campos de texto das tabelas relacionadas com prefixo
  for (const related of relatedInfo) {
    const quotedRelatedTable = `"${escapeIdentifier(related.table)}"`;
    const alias = related.table;
    for (const textCol of related.textColumns) {
      const quotedCol = `"${escapeIdentifier(textCol)}"`;
      const prefixedCol = `${alias}_${textCol}`;
      selectColumns.push(`${quotedRelatedTable}.${quotedCol} AS "${prefixedCol}"`);
      displayColumns.push(prefixedCol);
    }
  }

  const limit = Math.min(100, Math.max(1, params.limit ?? 10));
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * limit;
  const orderDir = params.orderDir === "asc" ? "ASC" : "DESC";
  const orderCol = params.order && displayColumns.includes(params.order) ? params.order : displayColumns[0] || columns[0];
  const filter = params.filter ?? {};

  // Construir JOINs
  const joins: string[] = [];
  for (const related of relatedInfo) {
    const quotedRelatedTable = `"${escapeIdentifier(related.table)}"`;
    const quotedFkCol = `"${escapeIdentifier(related.fkColumn)}"`;
    const quotedRefCol = `"${escapeIdentifier(related.refColumn)}"`;
    joins.push(`LEFT JOIN ${quotedRelatedTable} ON ${quotedTable}.${quotedFkCol} = ${quotedRelatedTable}.${quotedRefCol}`);
  }
  const joinSql = joins.length > 0 ? ` ${joins.join(" ")}` : "";

  // Construir WHERE com filtros (incluindo campos relacionados)
  const filterCols = Object.keys(filter).filter((k) => displayColumns.includes(k) && filter[k]);
  
  const whereParts: string[] = [];
  for (const col of filterCols) {
    const escaped = escapeSqliteString(filter[col]);
    // Verificar se é campo da tabela principal
    if (columns.includes(col)) {
      whereParts.push(`${quotedTable}."${escapeIdentifier(col)}" LIKE '%${escaped}%'`);
    } else {
      // Campo relacionado (formato: tabela_coluna)
      const parts = col.split("_");
      if (parts.length >= 2) {
        const tablePart = parts[0];
        const colPart = parts.slice(1).join("_");
        const related = relatedInfo.find((r) => r.table === tablePart && r.textColumns.includes(colPart));
        if (related) {
          const quotedRelatedTable = `"${escapeIdentifier(related.table)}"`;
          whereParts.push(`${quotedRelatedTable}."${escapeIdentifier(colPart)}" LIKE '%${escaped}%'`);
        }
      }
    }
  }
  const whereSql = whereParts.length > 0 ? ` WHERE ${whereParts.join(" AND ")}` : "";

  // Construir ORDER BY
  let quotedOrderCol: string;
  if (columns.includes(orderCol)) {
    quotedOrderCol = `${quotedTable}."${escapeIdentifier(orderCol)}"`;
  } else {
    // Verificar se é campo relacionado
    const parts = orderCol.split("_");
    if (parts.length >= 2) {
      const tablePart = parts[0];
      const colPart = parts.slice(1).join("_");
      const related = relatedInfo.find((r) => r.table === tablePart && r.textColumns.includes(colPart));
      if (related) {
        const quotedRelatedTable = `"${escapeIdentifier(related.table)}"`;
        quotedOrderCol = `${quotedRelatedTable}."${escapeIdentifier(colPart)}"`;
      } else {
        quotedOrderCol = `"${escapeIdentifier(orderCol)}"`;
      }
    } else {
      quotedOrderCol = `"${escapeIdentifier(orderCol)}"`;
    }
  }

  const countQuery = sql.raw(
    `SELECT count(*) as c FROM ${quotedTable}${joinSql}${whereSql}`
  );
  const countResult = await db.all(countQuery) as { c?: number }[];
  const total = Number(countResult?.[0]?.c ?? 0);

  const orderSql = `ORDER BY ${quotedOrderCol} ${orderDir}`;
  const selectQuery = sql.raw(
    `SELECT ${selectColumns.join(", ")} FROM ${quotedTable}${joinSql}${whereSql} ${orderSql} LIMIT ${limit} OFFSET ${offset}`
  );
  const rows = await db.all(selectQuery) as Record<string, unknown>[];

  return {
    items: Array.isArray(rows) ? rows : [],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    columns: displayColumns,
  };
}
