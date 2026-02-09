import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm";
import { postTypes, posts, postsTaxonomies, taxonomies, user, settings as settingsTable } from "../db/schema.ts";
import type { Database } from "./types/database.ts";

export type ListItem = {
  id: number;
  title: string;
  categories: string;
  tags: string;
  author: string;
  status: string | null;
  created_at: number | null;
  updated_at: number | null;
};

export type GetListItemsParams = {
  type?: string;
  status?: string;
  order?: string;
  orderDir?: "asc" | "desc";
  limit?: number;
  page?: number;
  /** Optional filters: column name -> search string (LIKE) */
  filter?: Record<string, string>;
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
] as const;

/**
 * Busca e retorna uma lista paginada de posts com suas taxonomias
 * @param db - Instância do banco de dados Drizzle
 * @param params - Parâmetros de filtragem, ordenação e paginação
 * @returns Lista paginada de posts com metadados de paginação
 */
export async function getListItems(db: Database, params: GetListItemsParams = {}): Promise<GetListItemsResult> {
  const typeSlug = params.type ?? "post";
  const status = params.status;
  const order = params.order ?? "created_at";
  const orderDir = params.orderDir ?? "desc";
  const limit = Math.min(Math.max(1, params.limit ?? 10), 100);
  const page = Math.max(1, params.page ?? 1);
  const offset = (page - 1) * limit;
  const filter = params.filter ?? {};

  const orderColumn =
    SORTABLE_COLUMNS.includes(order as (typeof SORTABLE_COLUMNS)[number]) ? order : "created_at";
  const orderFn = orderDir === "asc" ? asc : desc;

  const conditions = [
    eq(postTypes.slug, typeSlug),
    // Excluir posts "pai" do menu (show_in_menu = true); listar só os filhos/conteúdo
    sql`(json_extract(${posts.meta_values}, '$.show_in_menu') IS NULL OR json_extract(${posts.meta_values}, '$.show_in_menu') != 1)`,
  ];
  if (status) {
    conditions.push(eq(posts.status, status as "published" | "draft" | "archived"));
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

  if (filter.categories) {
    const categoryPostIds = await db
      .selectDistinct({ post_id: postsTaxonomies.post_id })
      .from(postsTaxonomies)
      .innerJoin(taxonomies, eq(postsTaxonomies.term_id, taxonomies.id))
      .where(and(eq(taxonomies.type, "category"), like(taxonomies.name, `%${filter.categories}%`)));
    const ids = categoryPostIds.map((r) => r.post_id);
    if (ids.length > 0) conditions.push(inArray(posts.id, ids));
    else conditions.push(sql`1 = 0`);
  }
  if (filter.tags) {
    const tagPostIds = await db
      .selectDistinct({ post_id: postsTaxonomies.post_id })
      .from(postsTaxonomies)
      .innerJoin(taxonomies, eq(postsTaxonomies.term_id, taxonomies.id))
      .where(and(eq(taxonomies.type, "tag"), like(taxonomies.name, `%${filter.tags}%`)));
    const ids = tagPostIds.map((r) => r.post_id);
    if (ids.length > 0) conditions.push(inArray(posts.id, ids));
    else conditions.push(sql`1 = 0`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const baseQuery = db
    .select({
      id: posts.id,
      title: posts.title,
      status: posts.status,
      created_at: posts.created_at,
      updated_at: posts.updated_at,
      author: user.name,
    })
    .from(posts)
    .innerJoin(postTypes, eq(posts.post_type_id, postTypes.id))
    .leftJoin(user, eq(posts.author_id, user.id))
    .where(whereClause);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(posts)
    .innerJoin(postTypes, eq(posts.post_type_id, postTypes.id))
    .leftJoin(user, eq(posts.author_id, user.id))
    .where(whereClause);

  const total = Number(countResult?.count ?? 0);

  const orderByColumn =
    orderColumn === "author"
      ? orderFn(user.name)
      : orderColumn === "id"
        ? orderFn(posts.id)
        : orderColumn === "title"
          ? orderFn(posts.title)
          : orderColumn === "status"
            ? orderFn(posts.status)
            : orderColumn === "created_at"
              ? orderFn(posts.created_at)
              : orderFn(posts.updated_at);

  const rows = await baseQuery
    .orderBy(orderByColumn)
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
    if (row.type === "category") {
      categoriesByPost[row.post_id]?.push(row.name ?? "");
    } else if (row.type === "tag") {
      tagsByPost[row.post_id]?.push(row.name ?? "");
    }
  }

  const items: ListItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title ?? "",
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
  params: GetSettingsListParams = {}
): Promise<GetSettingsListResult> {
  const order = SETTINGS_SORTABLE.includes(params.order as (typeof SETTINGS_SORTABLE)[number])
    ? params.order
    : "id";
  const orderDir = params.orderDir ?? "desc";
  const limit = Math.min(Math.max(1, params.limit ?? 10), 100);
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
  if (filter.name) filterConditions.push(like(settingsTable.name, `%${filter.name}%`));
  if (filter.value) filterConditions.push(like(settingsTable.value, `%${filter.value}%`));
  const whereClause = filterConditions.length > 0 ? and(...filterConditions) : undefined;

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
