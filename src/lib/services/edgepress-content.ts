/**
 * Serviço interno de leitura de conteúdo — mesma semântica que GET /api/content/*,
 sem HTTP: Drizzle, KV (via getContentApiRuntime), content-cache, content-post-payload.
 *
 * Temas e outras rotas devem instanciar com createEdgepressContent(locals, { baseUrl }).
 */

import { sql, eq, and, inArray } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { posts, locales } from "../../db/schema.ts";
import { getTableContentWithCache } from "../content-cache.ts";
import {
  getContentApiRuntime,
  getSafeTableName,
  getTableNames,
  escapeIdentifier,
  VALID_TABLE_IDENTIFIER,
} from "../db-utils.ts";
import { buildContentPostPayload, getPostTaxonomiesForPayload } from "../content-post-payload.ts";
import { parseMetaValues } from "../utils/meta-parser.ts";
import { isValidSlug } from "../utils/validation.ts";
import type { GetTableListParams } from "../list-table-dynamic.ts";

// --- Erros (APIs HTTP podem mapear para Response) ---

export class ContentNotFoundError extends Error {
  readonly status = 404;
  constructor(
    message: string,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ContentNotFoundError";
  }
}

export class ContentBadRequestError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ContentBadRequestError";
  }
}

// --- Tipos (compatíveis com o antigo cliente HTTP do tema) ---

export interface ContentListParams {
  page?: number;
  limit?: number;
  order?: string;
  orderDir?: "asc" | "desc";
  filter?: Record<string, string | number>;
  query?: Record<string, string | number>;
  locale?: string;
  locale_id?: number;
  id_locale_code?: number;
  filter_taxonomy_id?: number;
  filter_taxonomy_slug?: string;
  filter_taxonomy_type?: string;
}

export interface ContentListResponse<T = Record<string, unknown>> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  columns?: string[];
}

export interface ContentBySlugParams {
  status?: "published" | "draft" | "archived";
}

export interface ContentPostDetail {
  id: number;
  post_type_id: number;
  title: string;
  slug: string;
  excerpt?: string;
  body?: string;
  status: string;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
  meta_schema?: Record<string, unknown>;
  meta_values?: Record<string, unknown>;
  custom_fields?: Record<string, unknown>;
  body_smart?: unknown;
  media?: unknown[];
  [key: string]: unknown;
}

export type ContentRowResponse = Record<string, unknown> & {
  meta_values?: Record<string, unknown>;
};

export interface TaxonomyItem {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  type: string;
  parent_id?: number | null;
  created_at?: number | null;
  updated_at?: number | null;
  id_locale_code?: number | null;
  [key: string]: unknown;
}

export interface TaxonomiesResponse {
  items: TaxonomyItem[];
  total: number;
}

function flattenContentListParams(params: ContentListParams): Record<string, string> {
  const merged: Record<string, string> = {};
  const add = (k: string, v: string | number | undefined) => {
    if (v === undefined || v === "") return;
    merged[k] = String(v);
  };
  if (params.query) {
    for (const [k, v] of Object.entries(params.query)) {
      add(k, v);
    }
  }
  add("page", params.page);
  add("limit", params.limit);
  add("order", params.order);
  add("orderDir", params.orderDir);
  add("locale", params.locale);
  add("locale_id", params.locale_id);
  add("id_locale_code", params.id_locale_code);
  add("filter_taxonomy_id", params.filter_taxonomy_id);
  add("filter_taxonomy_slug", params.filter_taxonomy_slug);
  add("filter_taxonomy_type", params.filter_taxonomy_type);
  if (params.filter) {
    for (const [col, value] of Object.entries(params.filter)) {
      add(`filter_${col}`, value);
    }
  }
  return merged;
}

function mergedSearchToTableListOptions(
  merged: Record<string, string>,
  safeTable: string,
): {
  limit: number;
  page: number;
  order: string | undefined;
  orderDir: "asc" | "desc";
  filter: Record<string, string> | undefined;
} {
  const limit = Math.min(100, Math.max(1, parseInt(merged["limit"] ?? "10", 10) || 10));
  const page = Math.max(1, parseInt(merged["page"] ?? "1", 10) || 1);
  const order = merged["order"] && merged["order"] !== "" ? merged["order"] : undefined;
  const orderDir = (merged["orderDir"] === "asc" ? "asc" : "desc") as "asc" | "desc";

  const filter: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (!key.startsWith("filter_") || !value) continue;
    const filterKey = key.replace(/^filter_/, "");
    if (filterKey === "post_type") {
      if (/^\d+$/.test(value)) {
        filter["post_type_id"] = value;
      } else {
        filter["post_types_slug"] = value;
      }
    } else {
      filter[filterKey] = value;
    }
  }

  const filterParam = Object.keys(filter).length ? filter : undefined;
  return { limit, page, order, orderDir, filter: filterParam };
}

async function resolvePostLocaleFilter(
  filter: Record<string, string> | undefined,
  merged: Record<string, string>,
): Promise<Record<string, string> | undefined> {
  const localeParam = merged["locale"];
  const localeIdParam = merged["locale_id"] ?? merged["id_locale_code"];
  const next = filter ? { ...filter } : {};
  if (localeIdParam != null && localeIdParam.trim() !== "" && /^\d+$/.test(localeIdParam)) {
    next["id_locale_code"] = localeIdParam;
  } else if (localeParam != null && localeParam.trim() !== "") {
    const localeCode = localeParam.trim().toLowerCase().replace(/-/g, "_");
    const [row] = await db.select({ id: locales.id }).from(locales).where(eq(locales.locale_code, localeCode)).limit(1);
    if (row != null) {
      next["id_locale_code"] = String(row.id);
    }
  }
  return Object.keys(next).length ? next : undefined;
}

export async function getTableContentListResult(
  kv: ReturnType<typeof getContentApiRuntime>["kv"],
  safeTable: string,
  merged: Record<string, string>,
): Promise<ContentListResponse> {
  const { limit, page, order, orderDir, filter: initialFilter } = mergedSearchToTableListOptions(merged, safeTable);
  let filter = initialFilter;
  if (safeTable === "posts" && (merged["locale"] || merged["locale_id"] || merged["id_locale_code"])) {
    filter = await resolvePostLocaleFilter(filter, merged);
  }

  const params: GetTableListParams = {
    ...(order != null && order !== "" && { order }),
    orderDir,
    limit,
    page,
    ...(filter != null && { filter }),
  };

  const result = await getTableContentWithCache({
    kv,
    db,
    table: safeTable,
    params,
  });

  if (result.columns.includes("meta_values")) {
    result.items = result.items.map((item) => ({
      ...item,
      meta_values:
        item["meta_values"] != null
          ? parseMetaValues(String(item["meta_values"]))
          : ({} as Record<string, string>),
    }));
  }

  return {
    items: result.items,
    total: result.total,
    page: result.page,
    limit: result.limit,
    totalPages: result.totalPages,
    columns: result.columns,
  };
}

function parseStatusList(rawStatus: string | null): string[] {
  const allowedStatus = new Set(["published", "draft", "archived"]);
  if (!rawStatus) {
    return ["published"];
  }
  const list = rawStatus
    .split(",")
    .map((s) => s.trim())
    .filter((s) => allowedStatus.has(s));
  return list.length > 0 ? list : ["published"];
}

export type ContentPostPayload = Awaited<ReturnType<typeof buildContentPostPayload>>;

export async function getPostPayloadBySlug(
  kv: ReturnType<typeof getContentApiRuntime>["kv"],
  slug: string,
  rawStatus: string | null,
): Promise<ContentPostPayload> {
  if (!isValidSlug(slug)) {
    throw new ContentBadRequestError("Slug inválido");
  }
  const statusList = parseStatusList(rawStatus);
  const statusKey = statusList.join(",");
  const postCacheKey = `post:${slug}:status=${statusKey}`;

  if (kv) {
    try {
      const cached = (await kv.get(postCacheKey, "json")) as Record<string, unknown> | null;
      if (cached && typeof cached === "object") {
        return cached as ContentPostPayload;
      }
    } catch {
      // segue para o banco
    }
  }

  const rows = await db
    .select({
      id: posts.id,
      post_type_id: posts.post_type_id,
      author_id: posts.author_id,
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      body: posts.body,
      status: posts.status,
      meta_values: posts.meta_values,
      published_at: posts.published_at,
      created_at: posts.created_at,
      updated_at: posts.updated_at,
    })
    .from(posts)
    .where(
      statusList.length === 1
        ? and(eq(posts.slug, slug), eq(posts.status, statusList[0] as typeof posts.$inferSelect.status))
        : and(eq(posts.slug, slug), inArray(posts.status, statusList as typeof posts.$inferSelect.status[])),
    )
    .limit(1);

  const post = rows[0];
  if (!post) {
    throw new ContentNotFoundError("Post not found", { slug });
  }

  const payload = await buildContentPostPayload(db, post);

  if (kv) {
    try {
      await kv.put(postCacheKey, JSON.stringify(payload));
    } catch {
      // ignora
    }
  }

  return payload;
}

export async function getPostOrRowPayload(
  kv: ReturnType<typeof getContentApiRuntime>["kv"],
  safeTable: string,
  idOrSlug: string,
  rawStatus: string | null,
): Promise<ContentPostPayload | ContentRowResponse> {
  const isNumericId = /^\d+$/.test(idOrSlug);
  const idNum = isNumericId ? parseInt(idOrSlug, 10) : null;

  if (safeTable === "posts") {
    const bySlug = !isNumericId;
    if (bySlug && !isValidSlug(idOrSlug)) {
      throw new ContentBadRequestError("Slug inválido");
    }

    const statusList = parseStatusList(rawStatus);
    const statusKey = statusList.join(",");
    const postCacheKey = bySlug ? `post:${idOrSlug}:status=${statusKey}` : `post:id:${idNum}`;

    if (kv) {
      try {
        const cached = (await kv.get(postCacheKey, "json")) as Record<string, unknown> | null;
        if (cached && typeof cached === "object") {
          return cached as ContentPostPayload;
        }
      } catch {
        // segue
      }
    }

    const whereClause = bySlug
      ? statusList.length === 1
        ? and(eq(posts.slug, idOrSlug), eq(posts.status, statusList[0] as typeof posts.$inferSelect.status))
        : and(eq(posts.slug, idOrSlug), inArray(posts.status, statusList as typeof posts.$inferSelect.status[]))
      : eq(posts.id, idNum!);

    const [post] = await db
      .select({
        id: posts.id,
        post_type_id: posts.post_type_id,
        author_id: posts.author_id,
        title: posts.title,
        slug: posts.slug,
        excerpt: posts.excerpt,
        body: posts.body,
        status: posts.status,
        meta_values: posts.meta_values,
        published_at: posts.published_at,
        created_at: posts.created_at,
        updated_at: posts.updated_at,
      })
      .from(posts)
      .where(whereClause)
      .limit(1);

    if (!post) {
      throw new ContentNotFoundError("Post not found", bySlug ? { slug: idOrSlug } : { id: idNum });
    }

    const payload = await buildContentPostPayload(db, post);

    if (kv) {
      try {
        await kv.put(postCacheKey, JSON.stringify(payload));
      } catch {
        // ignora
      }
    }

    return payload;
  }

  if (!isNumericId || idNum === null || idNum < 1) {
    throw new ContentBadRequestError("For this table only numeric id is supported");
  }

  const quotedTable = `"${escapeIdentifier(safeTable)}"`;
  const rows = await db.all(sql.raw(`SELECT * FROM ${quotedTable} WHERE "id" = ${idNum} LIMIT 1`)) as Record<
    string,
    unknown
  >[];
  const row = rows?.[0];

  if (!row || typeof row !== "object") {
    throw new ContentNotFoundError("Record not found", { table: safeTable, id: idNum });
  }

  if ("meta_values" in row && row.meta_values != null) {
    (row as Record<string, unknown>).meta_values = parseMetaValues(String(row.meta_values));
  }

  return row as ContentRowResponse;
}

export class EdgepressContent {
  private readonly baseUrl: string;

  constructor(
    private readonly locals: App.Locals,
    baseUrl: string = "",
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private runtime() {
    return getContentApiRuntime(this.locals);
  }

  async getList<T = Record<string, unknown>>(
    tableOrSlug: string,
    params: ContentListParams = {},
  ): Promise<ContentListResponse<T>> {
    const { kv } = this.runtime();
    const allowedTables = await getTableNames(db);
    const safeTable = getSafeTableName(tableOrSlug, allowedTables);
    if (safeTable === null && VALID_TABLE_IDENTIFIER.test(tableOrSlug)) {
      throw new ContentNotFoundError("Table not found or not allowed");
    }
    if (safeTable === null) {
      throw new ContentBadRequestError("Invalid table segment");
    }
    const merged = flattenContentListParams(params);
    const result = await getTableContentListResult(kv, safeTable, merged);
    return result as ContentListResponse<T>;
  }

  async getPostsByTaxonomySlug<T = Record<string, unknown>>(
    slug: string,
    params: Omit<ContentListParams, "filter_taxonomy_slug"> = {},
  ): Promise<ContentListResponse<T>> {
    return this.getList<T>("posts", { ...params, filter_taxonomy_slug: slug });
  }

  async getListWithDetails(
    table: string,
    params: ContentListParams = {},
  ): Promise<ContentListResponse<ContentPostDetail>> {
    const list = await this.getList<Record<string, unknown>>(table, params);
    if (list.items.length === 0) {
      return { ...list, items: [] };
    }
    const items = await Promise.all(
      list.items.map(async (row) => {
        const id = row.id;
        if (id == null) return row as ContentPostDetail;
        const full = (await this.getItem(
          table,
          typeof id === "number" ? id : Number(id),
        )) as ContentPostDetail;
        return full;
      }),
    );
    return { ...list, items };
  }

  async getBySlug(slug: string, params: ContentBySlugParams = {}): Promise<ContentPostDetail> {
    const { kv } = this.runtime();
    const status = params.status ?? null;
    const payload = await getPostPayloadBySlug(kv, slug, status);
    return payload as unknown as ContentPostDetail;
  }

  async getItem(
    table: string,
    idOrSlug: string | number,
    options?: { status?: string | null },
  ): Promise<ContentPostDetail | ContentRowResponse> {
    const { kv } = this.runtime();
    const allowedTables = await getTableNames(db);
    const safeTable = getSafeTableName(table, allowedTables);
    if (!safeTable) {
      throw new ContentNotFoundError("Table not found or not allowed");
    }
    const segment = typeof idOrSlug === "number" ? String(idOrSlug) : idOrSlug;
    return getPostOrRowPayload(kv, safeTable, segment, options?.status ?? null) as Promise<
      ContentPostDetail | ContentRowResponse
    >;
  }

  async getPostTaxonomies(postId: number): Promise<TaxonomiesResponse> {
    try {
      const items = await getPostTaxonomiesForPayload(db, postId);
      const mapped: TaxonomyItem[] = items.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        type: t.type,
        description: t.description,
        parent_id: t.parent_id,
      }));
      return { items: mapped, total: mapped.length };
    } catch {
      return { items: [], total: 0 };
    }
  }

  async getTaxonomies(post_type: string, taxonomy_name: string): Promise<TaxonomiesResponse> {
    const postTypesRes = await this.getList<{
      id?: number;
      slug?: string;
      meta_schema?: string | unknown[];
    }>("post_types", {
      filter: { slug: post_type },
      limit: 1,
    });
    const pt = postTypesRes.items[0];
    if (!pt) {
      return { items: [], total: 0 };
    }
    const raw = pt.meta_schema;
    const schema =
      typeof raw === "string"
        ? (JSON.parse(raw) as unknown[])
        : Array.isArray(raw)
          ? raw
          : [];
    const taxonomyEntry = schema.find(
      (e: unknown) => (e as Record<string, unknown>)?.key === "taxonomy",
    ) as Record<string, unknown> | undefined;
    const allowed = Array.isArray(taxonomyEntry?.default) ? (taxonomyEntry.default as string[]) : [];
    if (!allowed.includes(taxonomy_name)) {
      return { items: [], total: 0 };
    }
    const taxRes = await this.getList<TaxonomyItem>("taxonomies", {
      filter: { type: taxonomy_name },
      limit: 500,
    });
    const idsThatAreParents = new Set(
      taxRes.items.map((t) => t.parent_id).filter((id): id is number => id != null),
    );
    const items = taxRes.items.filter((t) => !idsThatAreParents.has(t.id));
    return { items, total: items.length };
  }

  getMediaUrl(pathOrId: string | number): string {
    if (typeof pathOrId === "number") {
      return `${this.baseUrl}/api/media/${pathOrId}`;
    }
    const path = String(pathOrId).replace(/^\/+/, "");
    const normalized = path.startsWith("uploads/") ? path : `uploads/${path}`;
    const segments = normalized.split("/").map((s) => encodeURIComponent(s)).join("/");
    return `${this.baseUrl}/api/media/${segments}`;
  }

  async getMedia(pathOrId: string | number): Promise<Response> {
    const url = this.getMediaUrl(pathOrId);
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(`EdgePress Media ${res.status}: ${res.statusText}`);
    }
    return res;
  }

  async getMediaBlob(pathOrId: string | number): Promise<Blob> {
    const res = await this.getMedia(pathOrId);
    return res.blob();
  }
}

export function createEdgepressContent(
  locals: App.Locals,
  options?: { baseUrl?: string },
): EdgepressContent {
  const base =
    options?.baseUrl ??
    (typeof import.meta.env !== "undefined" && import.meta.env.EDGEPRESS_HOST
      ? String(import.meta.env.EDGEPRESS_HOST).replace(/\/$/, "")
      : "");
  return new EdgepressContent(locals, base);
}

/** Lista por segmento de tabela a partir da query string da requisição HTTP (rotas api/content). */
export async function getTableContentListFromUrl(
  locals: App.Locals,
  safeTable: string,
  url: URL,
): Promise<ContentListResponse> {
  const { kv } = getContentApiRuntime(locals);
  const merged = Object.fromEntries([...url.searchParams.entries()]);
  return getTableContentListResult(kv, safeTable, merged);
}

export async function getPostBySlugFromUrl(locals: App.Locals, slug: string, url: URL): Promise<ContentPostPayload> {
  const { kv } = getContentApiRuntime(locals);
  return getPostPayloadBySlug(kv, slug, url.searchParams.get("status"));
}

export async function getPostOrRowFromUrl(
  locals: App.Locals,
  safeTable: string,
  idOrSlug: string,
  url: URL,
): Promise<ContentPostPayload | ContentRowResponse> {
  const { kv } = getContentApiRuntime(locals);
  return getPostOrRowPayload(kv, safeTable, idOrSlug, url.searchParams.get("status"));
}
