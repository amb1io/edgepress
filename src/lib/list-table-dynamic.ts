/**
 * Listagem dinâmica por nome de tabela.
 * Quando type = nome de uma tabela do banco, lista as linhas dessa tabela com ordenação, filtro e paginação.
 */
import { sql } from "drizzle-orm";
import type { Database } from "./types/database.ts";
import { VALID_TABLE_IDENTIFIER } from "./db-utils.ts";

function safeIdentifier(name: string): string | null {
  return VALID_TABLE_IDENTIFIER.test(name) ? name : null;
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
  type RelatedWithAlias = (typeof relatedInfo)[number] & { alias: string };
  const relatedWithAliases: RelatedWithAlias[] = relatedInfo.map((r) => ({
    ...r,
    alias: r.table === safeTable ? `${safeTable}_ref` : r.table,
  }));

  // Adicionar todas as colunas da tabela principal
  const quotedTable = `"${escapeIdentifier(safeTable)}"`;
  selectColumns.push(`${quotedTable}.*`);
  displayColumns.push(...columns);

  for (const related of relatedWithAliases) {
    const quotedAlias = `"${escapeIdentifier(related.alias)}"`;
    for (const textCol of related.textColumns) {
      const quotedCol = `"${escapeIdentifier(textCol)}"`;
      const prefixedCol = `${related.alias}_${textCol}`;
      selectColumns.push(`${quotedAlias}.${quotedCol} AS "${escapeIdentifier(prefixedCol)}"`);
      displayColumns.push(prefixedCol);
    }
  }

  const limit = Math.min(100, Math.max(1, params.limit ?? 10));
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * limit;
  const orderDir = params.orderDir === "asc" ? "ASC" : "DESC";
  const metaOrderCandidate = safeTable === "posts" && params.order?.startsWith("meta_") && params.order.length > 5
    ? params.order.slice(5)
    : null;
  const useMetaOrder = metaOrderCandidate != null && /^[a-zA-Z0-9_]+$/.test(metaOrderCandidate);
  const orderCol = useMetaOrder
    ? params.order!
    : (params.order && displayColumns.includes(params.order) ? params.order : displayColumns[0] || columns[0]);
  const filter = params.filter ?? {};

  // Construir JOINs (com alias para self-join para evitar ambiguidade)
  const joins: string[] = [];
  for (const related of relatedWithAliases) {
    const isSelfJoin = related.table === safeTable;
    const quotedRelatedTable = `"${escapeIdentifier(related.table)}"`;
    const joinTarget = isSelfJoin ? `${quotedRelatedTable} AS "${escapeIdentifier(related.alias)}"` : quotedRelatedTable;
    const quotedFkCol = `"${escapeIdentifier(related.fkColumn)}"`;
    const quotedRefCol = `"${escapeIdentifier(related.refColumn)}"`;
    const rightSide = isSelfJoin ? `"${escapeIdentifier(related.alias)}".${quotedRefCol}` : `${quotedRelatedTable}.${quotedRefCol}`;
    joins.push(`LEFT JOIN ${joinTarget} ON ${quotedTable}.${quotedFkCol} = ${rightSide}`);
  }
  const joinSql = joins.length > 0 ? ` ${joins.join(" ")}` : "";

  // Construir WHERE com filtros (incluindo campos relacionados)
  const taxonomyFilterKeys = ["taxonomy_id", "taxonomy_slug", "taxonomy_type"];
  const filterCols = Object.keys(filter).filter(
    (k) => !taxonomyFilterKeys.includes(k) && displayColumns.includes(k) && filter[k]
  );

  const whereParts: string[] = [];
  // Na listagem de posts: excluir status "trash" e excluir o post "pai" do menu lateral (show_in_menu = 1)
  if (safeTable === "posts") {
    whereParts.push(`${quotedTable}."status" != 'trash'`);
    whereParts.push(`(json_extract(${quotedTable}."meta_values", '$.show_in_menu') IS NULL OR json_extract(${quotedTable}."meta_values", '$.show_in_menu') != 1)`);
    // Filtro por taxonomia: filter_taxonomy_id (id do termo) ou filter_taxonomy_slug (+ opcional filter_taxonomy_type)
    const taxonomyId = filter["taxonomy_id"];
    const taxonomySlug = filter["taxonomy_slug"];
    const taxonomyType = filter["taxonomy_type"];
    if (taxonomyId != null && taxonomyId.trim() !== "" && /^\d+$/.test(taxonomyId)) {
      whereParts.push(
        `${quotedTable}."id" IN (SELECT "post_id" FROM "posts_taxonomies" WHERE "term_id" = ${parseInt(taxonomyId, 10)})`
      );
    } else if (taxonomySlug != null && taxonomySlug.trim() !== "") {
      const slugEscaped = escapeSqliteString(taxonomySlug.trim());
      const typeEscaped = taxonomyType != null && taxonomyType.trim() !== ""
        ? escapeSqliteString(taxonomyType.trim())
        : null;
      if (typeEscaped != null) {
        whereParts.push(
          `${quotedTable}."id" IN (SELECT pt."post_id" FROM "posts_taxonomies" pt INNER JOIN "taxonomies" t ON pt."term_id" = t."id" WHERE t."slug" = '${slugEscaped}' AND t."type" = '${typeEscaped}')`
        );
      } else {
        whereParts.push(
          `${quotedTable}."id" IN (SELECT pt."post_id" FROM "posts_taxonomies" pt INNER JOIN "taxonomies" t ON pt."term_id" = t."id" WHERE t."slug" = '${slugEscaped}')`
        );
      }
    }
  }
  for (const col of filterCols) {
    const rawValue = filter[col];
    const escaped = escapeSqliteString(rawValue);
    if (columns.includes(col)) {
      if (col === "post_type_id" && /^\d+$/.test(rawValue)) {
        whereParts.push(`${quotedTable}."${escapeIdentifier(col)}" = ${parseInt(rawValue, 10)}`);
      } else if (col === "id_locale_code" && /^\d+$/.test(rawValue)) {
        whereParts.push(`${quotedTable}."${escapeIdentifier(col)}" = ${parseInt(rawValue, 10)}`);
      } else {
        whereParts.push(`${quotedTable}."${escapeIdentifier(col)}" LIKE '%${escaped}%'`);
      }
    } else {
      // Campo relacionado (formato: alias_coluna, ex: posts_ref_title ou locales_title)
      const related = relatedWithAliases.find((r) => {
        const prefix = `${r.alias}_`;
        return col.startsWith(prefix) && r.textColumns.includes(col.slice(prefix.length));
      });
      if (related) {
        const colPart = col.slice(related.alias.length + 1);
        whereParts.push(`"${escapeIdentifier(related.alias)}"."${escapeIdentifier(colPart)}" LIKE '%${escaped}%'`);
      }
    }
  }
  const whereSql = whereParts.length > 0 ? ` WHERE ${whereParts.join(" AND ")}` : "";

  // Construir ORDER BY (inclui custom field em meta_values quando order = "meta_<key>" na tabela posts)
  const META_ORDER_PREFIX = "meta_";
  const metaOrderKey = safeTable === "posts" && orderCol.startsWith(META_ORDER_PREFIX) && orderCol.length > META_ORDER_PREFIX.length
    ? orderCol.slice(META_ORDER_PREFIX.length)
    : null;
  const isSafeMetaKey = metaOrderKey != null && /^[a-zA-Z0-9_]+$/.test(metaOrderKey);

  let quotedOrderCol: string;
  if (isSafeMetaKey) {
    quotedOrderCol = `json_extract(${quotedTable}."meta_values", '$.${metaOrderKey.replace(/"/g, '""')}')`;
  } else if (columns.includes(orderCol)) {
    quotedOrderCol = `${quotedTable}."${escapeIdentifier(orderCol)}"`;
  } else {
    const related = relatedWithAliases.find((r) => {
      const prefix = `${r.alias}_`;
      return orderCol.startsWith(prefix) && r.textColumns.includes(orderCol.slice(prefix.length));
    });
    if (related) {
      const colPart = orderCol.slice(related.alias.length + 1);
      quotedOrderCol = `"${escapeIdentifier(related.alias)}"."${escapeIdentifier(colPart)}"`;
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
