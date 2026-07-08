/**
 * Cache-aside para conteúdo de tabelas: consulta primeiro o KV; em caso de miss, busca no banco
 * e armazena no KV apenas quando o resultado não é vazio. Resultados vazios ou null não são salvos no KV.
 */
import { sql } from "drizzle-orm";
import type { GetTableListParams, GetTableListResult } from "./list-table-dynamic.ts";
import { getTableList } from "./list-table-dynamic.ts";
import type { Database } from "./types/database.ts";
import { escapeIdentifier, prefixedTable, TABLE_PREFIX } from "./db-utils.ts";

/** Interface mínima do KV para permitir testes com mock (KVNamespace do Cloudflare). */
export type KVLike = {
  get(key: string, type?: "text" | "json"): Promise<string | unknown | null>;
  put(key: string, value: string): Promise<void>;
  delete?(key: string): Promise<void>;
};

const CACHE_KEY_PREFIX = "content:";
const ROW_CACHE_KEY_PREFIX = "content:row:";

function buildParamsHash(params: GetTableListParams): string {
  const normalized = {
    order: params.order ?? "",
    orderDir: params.orderDir ?? "desc",
    limit: params.limit ?? 10,
    page: params.page ?? 1,
    filter: params.filter ? JSON.stringify(Object.keys(params.filter).sort().map((k) => [k, params.filter![k]])) : "",
  };
  return JSON.stringify(normalized);
}

export function buildContentCacheKey(table: string, params: GetTableListParams): string {
  const safeTable = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) ? table : "invalid";
  return `${CACHE_KEY_PREFIX}${safeTable}:${buildParamsHash(params)}`;
}

export function buildContentRowCacheKey(table: string, id: number): string {
  const safeTable = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) ? table : "invalid";
  return `${ROW_CACHE_KEY_PREFIX}${safeTable}:${id}`;
}

function hasContent(result: GetTableListResult | null): boolean {
  if (result == null) return false;
  if (!Array.isArray(result.items)) return false;
  return result.items.length > 0;
}

export type GetTableContentWithCacheOptions = {
  kv: KVLike | null;
  db: Database;
  table: string;
  params?: GetTableListParams;
};

/**
 * Obtém o conteúdo da tabela: primeiro tenta o KV pela chave da pesquisa; se não achar, busca no
 * banco. Se o resultado do banco for não-vazio, armazena no KV antes de devolver. Se for vazio ou
 * null, devolve direto sem salvar no KV.
 */
export async function getTableContentWithCache(
  options: GetTableContentWithCacheOptions
): Promise<GetTableListResult> {
  const { kv, db, table, params = {} } = options;
  const key = buildContentCacheKey(table, params);

  if (kv) {
    try {
      const cached = await kv.get(key, "json") as GetTableListResult | null;
      if (cached != null && typeof cached === "object" && Array.isArray(cached.items)) {
        return cached as GetTableListResult;
      }
    } catch {
      // Ignora erro de KV e segue para o banco
    }
  }

  const result = await getTableList(db, table, params);

  if (kv && hasContent(result)) {
    try {
      await kv.put(key, JSON.stringify(result));
    } catch {
      // Não falha a resposta se o KV não aceitar o put
    }
  }

  return result;
}

export type GetRowContentWithCacheOptions = {
  kv: KVLike | null;
  db: Database;
  /** Logical table name (ex.: taxonomies) or physical (edp_taxonomies). */
  table: string;
  id: number;
  fetchRow?: () => Promise<Record<string, unknown> | null>;
};

/**
 * Cache-aside para uma linha única por id (tabelas que não são posts).
 * Chave: content:row:{table}:{id}
 */
export async function getRowContentWithCache(
  options: GetRowContentWithCacheOptions,
): Promise<Record<string, unknown> | null> {
  const { kv, db, table, id, fetchRow } = options;
  const logical =
    table.startsWith(TABLE_PREFIX) ? table.slice(TABLE_PREFIX.length) : table;
  const key = buildContentRowCacheKey(logical, id);

  if (kv) {
    try {
      const cached = (await kv.get(key, "json")) as Record<string, unknown> | null;
      if (cached != null && typeof cached === "object" && !Array.isArray(cached)) {
        return cached;
      }
    } catch {
      // segue para o banco
    }
  }

  let row: Record<string, unknown> | null = null;
  if (fetchRow) {
    row = await fetchRow();
  } else {
    const physical = prefixedTable(logical);
    const quotedTable = `"${escapeIdentifier(physical)}"`;
    const rows = (await db.all(
      sql.raw(`SELECT * FROM ${quotedTable} WHERE "id" = ${id} LIMIT 1`),
    )) as Record<string, unknown>[];
    row = rows?.[0] ?? null;
  }

  if (kv && row != null && typeof row === "object") {
    try {
      await kv.put(key, JSON.stringify(row));
    } catch {
      // ignora
    }
  }

  return row;
}
