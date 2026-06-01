import { getSourceKind } from "../../utils/content-source.ts";
import { getListItems, type ListOrderEntry } from "../../utils/list-items.ts";
import { getTableColumns, getTableList } from "../../utils/list-table-dynamic.ts";
import { normalizeDataListPageLength } from "../../admin/components/data-list-page-length.ts";
import type { Database } from "../../utils/types/database.ts";

export type AdminListPageParams = {
  type: string;
  page?: number;
  limit?: number;
  status?: string;
  order?: string;
  orderDir?: "asc" | "desc";
  orders?: ListOrderEntry[];
  filter?: Record<string, string>;
  /** Busca global do DataTables → filtro em título (posts) ou colunas texto (tabela). */
  search?: string;
  authorId?: string;
};

export type AdminListPageResult = {
  loadFromTable: boolean;
  items: Record<string, unknown>[];
  columns: { key: string; label?: string; sortable?: boolean }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

function formatListDate(ts: number | null, locale: string): string {
  if (ts == null) return "—";
  const loc = locale === "pt-br" ? "pt-BR" : locale === "es" ? "es" : "en";
  return new Date(ts).toLocaleString(loc);
}

async function mergeSearchFilter(
  db: Database,
  tableType: string,
  filter: Record<string, string> | undefined,
  search: string | undefined,
  loadFromTable: boolean,
): Promise<Record<string, string> | undefined> {
  const q = search?.trim();
  if (!q) return filter;
  const next = { ...(filter ?? {}) };
  if (!loadFromTable) {
    if (!next.title) next.title = q;
    return next;
  }
  const cols = await getTableColumns(db, tableType);
  const preferred = ["name", "title", "email", "slug", "value"];
  const col = preferred.find((c) => cols.includes(c)) ?? cols.find((c) => c !== "id");
  if (col && !next[col]) next[col] = q;
  return next;
}

/**
 * Uma página da listagem admin (posts por post_type ou linhas de tabela).
 */
export async function getAdminListPage(
  db: Database,
  params: AdminListPageParams,
  locale: string,
): Promise<AdminListPageResult> {
  const type = params.type?.trim() || "post";
  const page = Math.max(1, params.page ?? 1);
  const limit = normalizeDataListPageLength(params.limit ?? 10);
  const loadFromTable = (await getSourceKind(db, type)) === "table";
  const filter = await mergeSearchFilter(
    db,
    type,
    params.filter,
    params.search,
    loadFromTable,
  );

  if (loadFromTable) {
    const tableResult = await getTableList(db, type, {
      page,
      limit,
      ...(params.order ? { order: params.order } : {}),
      ...(params.orderDir ? { orderDir: params.orderDir } : {}),
      ...(params.orders?.length ? { orders: params.orders } : {}),
      ...(filter ? { filter } : {}),
    });

    const items = tableResult.items.map((row) => {
      const formatted: Record<string, unknown> = { ...row };
      for (const key of Object.keys(formatted)) {
        if (key.endsWith("_at") || key.endsWith("At") || key === "expires_at") {
          const val = formatted[key];
          if (typeof val === "number") {
            formatted[key] = formatListDate(val, locale);
          }
        }
      }
      return formatted;
    });

    return {
      loadFromTable: true,
      items,
      columns: tableResult.columns.map((key) => ({ key })),
      total: tableResult.total,
      page: tableResult.page,
      limit: tableResult.limit,
      totalPages: tableResult.totalPages,
    };
  }

  const listResult = await getListItems(db, {
    type,
    page,
    limit,
    ...(params.status ? { status: params.status } : {}),
    ...(params.order ? { order: params.order } : {}),
    ...(params.orderDir ? { orderDir: params.orderDir } : {}),
    ...(params.orders?.length ? { orders: params.orders } : {}),
    ...(filter ? { filter } : {}),
    ...(params.authorId ? { authorId: params.authorId } : {}),
  });

  const items = listResult.items.map((i) => ({
    ...i,
    language: i.language || "—",
    order: i.order || "—",
    categories: i.categories || "—",
    tags: i.tags || "—",
    author: i.author || "—",
    status: i.status ?? "—",
    created_at: formatListDate(i.created_at, locale),
    updated_at: formatListDate(i.updated_at, locale),
  }));

  return {
    loadFromTable: false,
    items,
    columns: [
      { key: "title", sortable: true },
      { key: "language", sortable: false },
      { key: "order", sortable: false },
      { key: "categories", sortable: false },
      { key: "tags", sortable: false },
      { key: "author", sortable: true },
      { key: "status", sortable: true },
      { key: "created_at", sortable: true },
      { key: "updated_at", sortable: true },
    ],
    total: listResult.total,
    page: listResult.page,
    limit: listResult.limit,
    totalPages: listResult.totalPages,
  };
}
