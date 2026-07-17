import { and, asc, desc, eq, inArray, isNull, like, ne, sql } from "drizzle-orm";
import {
  locales,
  postTypes,
  posts,
  postsTaxonomies,
  taxonomies,
  user,
  settings as settingsTable,
} from "../db/schema.ts";
import type { Database } from "./types/database.ts";
import { flattenPostHierarchy } from "../core/services/post-hierarchy-list.ts";

const HIERARCHICAL_LIST_TYPES = new Set(["post", "page"]);

export type ListItem = {
  id: number;
  title: string;
  language: string;
  order: string;
  categories: string;
  tags: string;
  author: string;
  status: string | null;
  created_at: number | null;
  updated_at: number | null;
};

export type ListOrderEntry = { column: string; dir: "asc" | "desc" };

export type GetListItemsParams = {
  type?: string;
  status?: string;
  order?: string;
  orderDir?: "asc" | "desc";
  /** Ordenação multi-coluna; tem prioridade sobre `order` / `orderDir`. */
  orders?: ListOrderEntry[];
  limit?: number;
  page?: number;
  /** Optional filters: column name -> search string (LIKE) */
  filter?: Record<string, string>;
  /** Quando definido (ex.: perfil autor), lista apenas posts deste autor. */
  authorId?: string;
};

export type GetListItemsResult = {
  items: ListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const SORTABLE_COLUMNS = [
  "id",
  "title",
  "author",
  "status",
  "created_at",
  "updated_at",
  "order",
  "language",
  "categories",
  "tags",
] as const;

const categoriesSortExpr = sql<string>`(
  SELECT MIN(${taxonomies.name})
  FROM ${postsTaxonomies}
  INNER JOIN ${taxonomies} ON ${eq(postsTaxonomies.term_id, taxonomies.id)}
  WHERE ${eq(postsTaxonomies.post_id, posts.id)}
    AND ${taxonomies.type} != 'tag'
)`;

const tagsSortExpr = sql<string>`(
  SELECT MIN(${taxonomies.name})
  FROM ${postsTaxonomies}
  INNER JOIN ${taxonomies} ON ${eq(postsTaxonomies.term_id, taxonomies.id)}
  WHERE ${eq(postsTaxonomies.post_id, posts.id)}
    AND ${taxonomies.type} = 'tag'
)`;

const orderMetaSortExpr = sql<number>`CAST(
  COALESCE(NULLIF(json_extract(${posts.meta_values}, '$.order'), ''), '0') AS INTEGER
)`;

/**
 * Busca e retorna uma lista paginada de posts com suas taxonomias
 * @param db - Instância do banco de dados Drizzle
 * @param params - Parâmetros de filtragem, ordenação e paginação
 * @returns Lista paginada de posts com metadados de paginação
 */
export async function getListItems(
  db: Database,
  params: GetListItemsParams = {},
): Promise<GetListItemsResult> {
  const typeSlug = params.type ?? "post";
  const useHierarchy = HIERARCHICAL_LIST_TYPES.has(typeSlug);
  const status = params.status;
  const orderEntries: ListOrderEntry[] =
    params.orders && params.orders.length > 0
      ? params.orders
      : [
          {
            column: params.order ?? "created_at",
            dir: params.orderDir ?? "desc",
          },
        ];
  const limit = Math.min(Math.max(1, params.limit ?? 10), 5000);
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * limit;
  const filter = params.filter ?? {};

  function orderExpression(entry: ListOrderEntry) {
    const column = SORTABLE_COLUMNS.includes(
      entry.column as (typeof SORTABLE_COLUMNS)[number],
    )
      ? entry.column
      : "created_at";
    const orderFn = entry.dir === "asc" ? asc : desc;
    if (column === "author") return orderFn(user.name);
    if (column === "id") return orderFn(posts.id);
    if (column === "title") return orderFn(posts.title);
    if (column === "status") return orderFn(posts.status);
    if (column === "order") return orderFn(orderMetaSortExpr);
    if (column === "language") return orderFn(locales.language);
    if (column === "categories") return orderFn(categoriesSortExpr);
    if (column === "tags") return orderFn(tagsSortExpr);
    if (column === "created_at") return orderFn(posts.created_at);
    return orderFn(posts.updated_at);
  }

  const conditions = [
    eq(postTypes.slug, typeSlug),
    // Excluir posts "pai" do menu (show_in_menu = true); listar só os filhos/conteúdo
    sql`(json_extract(${posts.meta_values}, '$.show_in_menu') IS NULL OR json_extract(${posts.meta_values}, '$.show_in_menu') != 1)`,
    // Excluir posts na lixeira
    ne(posts.status, "trash"),
  ];
  if (typeSlug === "menus") {
    conditions.push(isNull(posts.parent_id));
  }
  if (status) {
    conditions.push(
      eq(posts.status, status as "published" | "draft" | "archived"),
    );
  }
  if (filter.title) {
    conditions.push(like(posts.title, `%${filter.title}%`));
  }
  if (filter.status) {
    conditions.push(like(posts.status, `%${filter.status}%`));
  }
  if (filter.author) {
    conditions.push(like(user.name, `%${filter.author}%`));
  }
  if (params.authorId) {
    conditions.push(eq(posts.author_id, params.authorId));
  }
  if (filter.taxonomy_id && /^\d+$/.test(filter.taxonomy_id)) {
    const termId = parseInt(filter.taxonomy_id, 10);
    conditions.push(
      sql`${posts.id} IN (
        SELECT ${postsTaxonomies.post_id}
        FROM ${postsTaxonomies}
        WHERE ${postsTaxonomies.term_id} = ${termId}
      )`,
    );
  }

  if (filter.categories) {
    const categoryPostIds = await db
      .selectDistinct({ post_id: postsTaxonomies.post_id })
      .from(postsTaxonomies)
      .innerJoin(taxonomies, eq(postsTaxonomies.term_id, taxonomies.id))
      .where(
        and(
          ne(taxonomies.type, "tag"),
          like(taxonomies.name, `%${filter.categories}%`),
        ),
      );
    const ids = categoryPostIds.map((r) => r.post_id);
    if (ids.length > 0) conditions.push(inArray(posts.id, ids));
    else conditions.push(sql`1 = 0`);
  }
  if (filter.tags) {
    const tagPostIds = await db
      .selectDistinct({ post_id: postsTaxonomies.post_id })
      .from(postsTaxonomies)
      .innerJoin(taxonomies, eq(postsTaxonomies.term_id, taxonomies.id))
      .where(
        and(
          eq(taxonomies.type, "tag"),
          like(taxonomies.name, `%${filter.tags}%`),
        ),
      );
    const ids = tagPostIds.map((r) => r.post_id);
    if (ids.length > 0) conditions.push(inArray(posts.id, ids));
    else conditions.push(sql`1 = 0`);
  }
  if (filter.created_at) {
    conditions.push(
      sql`CAST(${posts.created_at} AS TEXT) LIKE ${`%${filter.created_at}%`}`,
    );
  }
  if (filter.updated_at) {
    conditions.push(
      sql`CAST(${posts.updated_at} AS TEXT) LIKE ${`%${filter.updated_at}%`}`,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const baseQuery = db
    .select({
      id: posts.id,
      title: posts.title,
      parent_id: posts.parent_id,
      language: locales.language,
      order: sql<string>`COALESCE(CAST(json_extract(${posts.meta_values}, '$.order') AS TEXT), '')`,
      status: posts.status,
      created_at: posts.created_at,
      updated_at: posts.updated_at,
      author: user.name,
    })
    .from(posts)
    .innerJoin(postTypes, eq(posts.post_type_id, postTypes.id))
    .leftJoin(user, eq(posts.author_id, user.id))
    .leftJoin(locales, eq(posts.id_locale_code, locales.id))
    .where(whereClause);

  if (useHierarchy) {
    const allRows = await baseQuery;
    const flatRows = flattenPostHierarchy(
      allRows.map((row) => ({
        id: row.id,
        title: row.title ?? "",
        parent_id: row.parent_id ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
    );
    const total = flatRows.length;
    const pageRows = flatRows.slice(offset, offset + limit);
    const postIds = pageRows.map((r) => r.id);
    const rowById = new Map(allRows.map((row) => [row.id, row]));

    const termRows =
      postIds.length > 0
        ? await db
            .select({
              post_id: postsTaxonomies.post_id,
              name: taxonomies.name,
              type: taxonomies.type,
            })
            .from(postsTaxonomies)
            .innerJoin(taxonomies, eq(postsTaxonomies.term_id, taxonomies.id))
            .where(inArray(postsTaxonomies.post_id, postIds))
        : [];

    const categoriesByPost: Record<number, string[]> = {};
    const tagsByPost: Record<number, string[]> = {};
    for (const id of postIds) {
      categoriesByPost[id] = [];
      tagsByPost[id] = [];
    }
    for (const row of termRows) {
      if (row.type === "tag") {
        tagsByPost[row.post_id]?.push(row.name ?? "");
      } else {
        categoriesByPost[row.post_id]?.push(row.name ?? "");
      }
    }

    const items: ListItem[] = pageRows.map((flatRow) => {
      const r = rowById.get(flatRow.id);
      return {
        id: flatRow.id,
        title: flatRow.displayTitle,
        language: r?.language ?? "",
        order: r?.order ?? "",
        categories: (categoriesByPost[flatRow.id] ?? []).join(", "),
        tags: (tagsByPost[flatRow.id] ?? []).join(", "),
        author: r?.author ?? "",
        status: r?.status ?? null,
        created_at: r?.created_at ?? null,
        updated_at: r?.updated_at ?? null,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(posts)
    .innerJoin(postTypes, eq(posts.post_type_id, postTypes.id))
    .leftJoin(user, eq(posts.author_id, user.id))
    .leftJoin(locales, eq(posts.id_locale_code, locales.id))
    .where(whereClause);

  const total = Number(countResult?.count ?? 0);

  const rows = await baseQuery
    .orderBy(...orderEntries.map((entry) => orderExpression(entry)))
    .limit(limit)
    .offset(offset);

  const postIds = rows.map((r) => r.id);
  const termRows =
    postIds.length > 0
      ? await db
          .select({
            post_id: postsTaxonomies.post_id,
            name: taxonomies.name,
            type: taxonomies.type,
          })
          .from(postsTaxonomies)
          .innerJoin(taxonomies, eq(postsTaxonomies.term_id, taxonomies.id))
          .where(inArray(postsTaxonomies.post_id, postIds))
      : [];

  const categoriesByPost: Record<number, string[]> = {};
  const tagsByPost: Record<number, string[]> = {};
  for (const id of postIds) {
    categoriesByPost[id] = [];
    tagsByPost[id] = [];
  }
  for (const row of termRows) {
    if (row.type === "tag") {
      tagsByPost[row.post_id]?.push(row.name ?? "");
    } else {
      categoriesByPost[row.post_id]?.push(row.name ?? "");
    }
  }

  const items: ListItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title ?? "",
    language: r.language ?? "",
    order: r.order ?? "",
    categories: (categoriesByPost[r.id] ?? []).join(", "),
    tags: (tagsByPost[r.id] ?? []).join(", "),
    author: r.author ?? "",
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

export type SettingsListItem = {
  id: number;
  name: string;
  value: string;
  autoload: string;
};

export type GetSettingsListParams = {
  order?: string;
  orderDir?: "asc" | "desc";
  limit?: number;
  page?: number;
  filter?: Record<string, string>;
};

export type GetSettingsListResult = {
  items: SettingsListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const SETTINGS_SORTABLE = ["id", "name", "value", "autoload"] as const;

/**
 * Lista registros da tabela settings (paginação, ordenação e filtro).
 * Usado quando type=settings e a tabela "settings" existe no banco.
 */
export async function getSettingsListItems(
  db: Database,
  params: GetSettingsListParams = {},
): Promise<GetSettingsListResult> {
  const order = SETTINGS_SORTABLE.includes(
    params.order as (typeof SETTINGS_SORTABLE)[number],
  )
    ? params.order
    : "id";
  const orderDir = params.orderDir ?? "desc";
  const limit = Math.min(Math.max(1, params.limit ?? 10), 5000);
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * limit;
  const filter = params.filter ?? {};

  const orderFn = orderDir === "asc" ? asc : desc;
  const orderByCol =
    order === "name"
      ? orderFn(settingsTable.name)
      : order === "value"
        ? orderFn(settingsTable.value)
        : order === "autoload"
          ? orderFn(settingsTable.autoload)
          : orderFn(settingsTable.id);

  const filterConditions = [];
  if (filter.name)
    filterConditions.push(like(settingsTable.name, `%${filter.name}%`));
  if (filter.value)
    filterConditions.push(like(settingsTable.value, `%${filter.value}%`));
  if (filter.autoload) {
    const normalized = filter.autoload.trim().toLowerCase();
    if (["1", "true", "sim", "yes", "y"].includes(normalized)) {
      filterConditions.push(eq(settingsTable.autoload, true));
    } else if (["0", "false", "nao", "não", "no", "n"].includes(normalized)) {
      filterConditions.push(eq(settingsTable.autoload, false));
    }
  }
  const whereClause =
    filterConditions.length > 0 ? and(...filterConditions) : undefined;

  const rows = await db
    .select({
      id: settingsTable.id,
      name: settingsTable.name,
      value: settingsTable.value,
      autoload: settingsTable.autoload,
    })
    .from(settingsTable)
    .where(whereClause)
    .orderBy(orderByCol)
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(settingsTable)
    .where(whereClause);
  const total = Number(countRow?.count ?? 0);

  const items: SettingsListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name ?? "",
    value: r.value ?? "",
    autoload: r.autoload ? "Sim" : "Não",
  }));

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}
