import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { EDP_TABLES } from "../../db/table-prefix.ts";
import { locales, postTypes, posts, postsTaxonomies, taxonomies } from "../../db/schema.ts";
import { parseMetaValues } from "../../utils/meta-parser.ts";
import { getPostCustomFields } from "../../utils/content-post-payload.ts";

type QueryInput = Record<string, unknown> | string | null | undefined;

type LegacyPostRecord = Record<string, unknown> & {
  id: number;
  slug: string;
  title: string;
  tags: string;
};

type PostRow = {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  status: string | null;
  published_at: number | null;
  created_at: number | null;
  updated_at: number | null;
  meta_values: string | null;
  post_type_slug: string;
  locale_code: string | null;
};

function normalizeParams(params: QueryInput): URLSearchParams {
  if (!params) return new URLSearchParams();
  if (typeof params === "string") return new URLSearchParams(params);

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    search.set(key, String(value));
  }
  return search;
}

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Match slugs like `{slug}-pt-br` without SQL LIKE.
 * In SQLite, `_` in LIKE is a single-char wildcard; long slugs (many hyphens/underscores)
 * trigger "LIKE or GLOB pattern too complex" on D1.
 */
function sqlSlugPrefixMatch(column: string, escapedSlug: string): string {
  if (!escapedSlug) return "0";
  return `instr(${column}, '${escapedSlug}-') = 1`;
}

function localeToLegacyLang(localeCode: string | null, metaLanguage?: string): string[] {
  const normalizedMeta = metaLanguage?.toLowerCase().replace(/[_-]/g, "");
  if (normalizedMeta === "ptbr" || normalizedMeta === "br") return ["br"];
  if (normalizedMeta === "enus" || normalizedMeta === "en") return ["en"];

  if (!localeCode) return [];
  if (localeCode.startsWith("pt")) return ["br"];
  if (localeCode.startsWith("en")) return ["en"];
  return [localeCode.replace("_", "-").toLowerCase()];
}

function toLegacyTags(meta: Record<string, string>, postType: string, localeCode: string | null): string {
  const parsedTags = meta["tags"];
  if (parsedTags) return parsedTags;

  const legacyPostType = meta["posttype"] || meta["legacy_posttype"] || postType;
  const tagsObject: Record<string, unknown> = {
    language: localeToLegacyLang(localeCode, meta["language"]),
    posttype: legacyPostType,
  };
  return JSON.stringify([JSON.stringify(tagsObject)]);
}

function mapPostRecord(row: PostRow): LegacyPostRecord {
  const meta = parseMetaValues(row.meta_values);
  const mapped: LegacyPostRecord = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? "",
    body: row.body ?? "",
    status: row.status ?? "draft",
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    post_type: row.post_type_slug,
    tags: toLegacyTags(meta, row.post_type_slug, row.locale_code),
  };

  for (const [key, value] of Object.entries(meta)) {
    if (key === "tags") continue;
    mapped[key] = value;
  }

  const orderRaw = meta["order"];
  if (orderRaw != null && orderRaw !== "") {
    const parsed = Number.parseInt(String(orderRaw), 10);
    mapped.order = Number.isNaN(parsed) ? 0 : parsed;
  }

  return mapped;
}

function resolveMediaPath(path: unknown): string {
  if (path == null || path === "") return "";
  const str = String(path).trim();
  if (!str) return "";
  if (str.startsWith("http://") || str.startsWith("https://")) return str;
  if (str.startsWith("/api/media")) return str;
  if (str.startsWith("/uploads/") || str.startsWith("/")) return `/api/media${str}`;
  return `/api/media/uploads/${str}`;
}

async function resolveAttachmentUrl(attachmentId: unknown): Promise<string> {
  const id =
    typeof attachmentId === "number"
      ? attachmentId
      : parseInt(String(attachmentId ?? ""), 10);
  if (!Number.isInteger(id) || id <= 0) return "";

  const rows = (await db.all(sql.raw(`
    SELECT p.meta_values
    FROM ${EDP_TABLES.posts} p
    INNER JOIN ${EDP_TABLES.post_types} pt ON p.post_type_id = pt.id
    WHERE p.id = ${id} AND pt.slug = 'attachment'
    LIMIT 1
  `))) as { meta_values: string | null }[];

  const meta = parseMetaValues(rows[0]?.meta_values);
  const path = meta.attachment_path || meta.attachment_file;
  return resolveMediaPath(path);
}

function pickCustomFieldValue(
  customFields: Awaited<ReturnType<typeof getPostCustomFields>>,
  key: string,
): string {
  const normalized = key.toLowerCase();
  for (const cf of customFields) {
    if (cf.title.toLowerCase() === normalized || cf.slug.toLowerCase().includes(normalized)) {
      const byName = cf.fields.find((f) => f.name.toLowerCase() === normalized && f.value);
      if (byName) return byName.value;
      const fileField = cf.fields.find((f) => f.type === "file" && f.value);
      if (fileField) return fileField.value;
      const first = cf.fields.find((f) => f.value);
      if (first) return first.value;
    }
    for (const field of cf.fields) {
      if (field.name.toLowerCase() === normalized && field.value) {
        return field.value;
      }
    }
  }
  return "";
}

const EQUIPE_DATA_BLOCK_TITLE = "dados da equipe";

function pickEquipeDataField(
  customFields: Awaited<ReturnType<typeof getPostCustomFields>>,
  fieldName: string,
): string {
  const block = customFields.find(
    (cf) => cf.title.trim().toLowerCase() === EQUIPE_DATA_BLOCK_TITLE,
  );
  if (!block) return "";

  const normalized = fieldName.trim().toLowerCase();
  const field = block.fields.find(
    (item) => item.name.trim().toLowerCase() === normalized && item.value.trim(),
  );
  return field?.value.trim() ?? "";
}

async function enrichEquipeRecord(record: LegacyPostRecord): Promise<LegacyPostRecord> {
  const customFields = await getPostCustomFields(db as never, record.id);
  const cargo = pickEquipeDataField(customFields, "cargo");
  const dono = pickEquipeDataField(customFields, "dono");

  return {
    ...record,
    ...(cargo ? { cargo } : {}),
    ...(dono && !record.dono ? { dono } : {}),
  };
}

async function enrichThumbnailRecord(record: LegacyPostRecord): Promise<LegacyPostRecord> {
  const thumbId = record.post_thumbnail_id;
  const thumbPath = record.post_thumbnail_path ?? record.image;
  let thumbnail_url = "";
  if (thumbId) {
    thumbnail_url = await resolveAttachmentUrl(thumbId);
  }
  if (!thumbnail_url && thumbPath) {
    thumbnail_url = resolveMediaPath(thumbPath);
  }

  return {
    ...record,
    thumbnail_url,
    thumbnail: thumbnail_url,
  };
}

async function enrichPageRecord(record: LegacyPostRecord): Promise<LegacyPostRecord> {
  const withThumbnail = await enrichThumbnailRecord(record);

  const customFields = await getPostCustomFields(db as never, record.id);
  const bgRaw =
    pickCustomFieldValue(customFields, "bg_image") ||
    (typeof record.bg_image === "string" ? record.bg_image : "");

  return {
    ...withThumbnail,
    bg_image: resolveMediaPath(bgRaw),
  };
}

const POST_SELECT_SQL = `
  SELECT
    p.id,
    p.slug,
    p.title,
    p.excerpt,
    p.body,
    p.status,
    p.published_at,
    p.created_at,
    p.updated_at,
    p.meta_values,
    pt.slug AS post_type_slug,
    l.locale_code AS locale_code
  FROM ${EDP_TABLES.posts} p
  INNER JOIN ${EDP_TABLES.post_types} pt ON p.post_type_id = pt.id
  LEFT JOIN ${EDP_TABLES.locales} l ON p.id_locale_code = l.id
`;

function localeSqlFilter(lang?: string): string {
  if (lang === "en") {
    return `AND (l.locale_code LIKE 'en%' OR json_extract(p.meta_values, '$.language') LIKE '%en%')`;
  }
  if (lang === "br") {
    return `AND (l.locale_code LIKE 'pt%' OR json_extract(p.meta_values, '$.language') LIKE '%pt%')`;
  }
  return "";
}

function metaSqlFilters(meta?: Record<string, string>): string {
  if (!meta) return "";
  return Object.entries(meta)
    .map(([key, value]) => {
      const safeKey = escapeSqlLiteral(key.trim());
      const safeValue = escapeSqlLiteral(String(value).trim());
      if (!safeKey || !safeValue) return "";
      return `AND lower(json_extract(p.meta_values, '$.${safeKey}')) = lower('${safeValue}')`;
    })
    .filter(Boolean)
    .join("\n        ");
}

export type CategoryPostsOptions = {
  meta?: Record<string, string>;
  postTypeSlug?: string;
  requireBody?: boolean;
};

function isJobRecord(record: LegacyPostRecord): boolean {
  return (
    record.posttype === "jobs" ||
    record.legacy_posttype === "jobs" ||
    record.post_type === "jobs"
  );
}

export class ThemeContentGateway {
  private async queryPosts(rawSql: string): Promise<LegacyPostRecord[]> {
    const rows = (await db.all(sql.raw(rawSql))) as PostRow[];
    return rows.map(mapPostRecord);
  }

  async getPosts(params?: QueryInput): Promise<LegacyPostRecord[]> {
    const search = normalizeParams(params);
    const slugEq = search.get("filters[slug][$eq]") ?? search.get("slug");
    const limit = Math.min(1000, Math.max(1, parseInt(search.get("limit") ?? "200", 10) || 200));

    if (slugEq) {
      return this.findPostsByLegacySlug(slugEq, limit);
    }

    return this.queryPosts(`
      ${POST_SELECT_SQL}
      WHERE p.status = 'published'
      ORDER BY p.updated_at DESC
      LIMIT ${limit}
    `);
  }

  async findPostsByLegacySlug(slug: string, limit = 10): Promise<LegacyPostRecord[]> {
    const safeSlug = escapeSqlLiteral(slug.trim());
    if (!safeSlug) return [];

    return this.queryPosts(`
      ${POST_SELECT_SQL}
      WHERE p.status = 'published'
        AND (
          p.slug = '${safeSlug}'
          OR json_extract(p.meta_values, '$.slug') = '${safeSlug}'
          OR ${sqlSlugPrefixMatch("p.slug", safeSlug)}
        )
      ORDER BY p.updated_at DESC
      LIMIT ${Math.min(1000, Math.max(1, limit))}
    `);
  }

  async getPostsByType(postTypeSlug: string, params?: QueryInput): Promise<LegacyPostRecord[]> {
    const search = normalizeParams(params);
    const slugEq = search.get("filters[slug][$eq]") ?? search.get("slug");
    const limit = Math.min(1000, Math.max(1, parseInt(search.get("limit") ?? "200", 10) || 200));
    const safeType = escapeSqlLiteral(postTypeSlug.trim());
    if (!safeType) return [];

    const slugFilter = slugEq
      ? `AND (
          p.slug = '${escapeSqlLiteral(slugEq)}'
          OR json_extract(p.meta_values, '$.slug') = '${escapeSqlLiteral(slugEq)}'
          OR ${sqlSlugPrefixMatch("p.slug", escapeSqlLiteral(slugEq))}
        )`
      : "";

    return this.queryPosts(`
      ${POST_SELECT_SQL}
      WHERE p.status = 'published'
        AND (
          pt.slug = '${safeType}'
          OR json_extract(p.meta_values, '$.posttype') = '${safeType}'
          OR json_extract(p.meta_values, '$.legacy_posttype') = '${safeType}'
        )
        ${slugFilter}
      ORDER BY ${
        safeType === "jobs"
          ? "p.created_at DESC"
          : "CAST(json_extract(p.meta_values, '$.order') AS INTEGER) DESC, p.title ASC"
      }
      LIMIT ${limit}
    `);
  }

  async getPageBySlug(slug: string, params?: QueryInput): Promise<LegacyPostRecord[]> {
    const safeSlug = escapeSqlLiteral(slug.trim());
    if (!safeSlug) return [];

    const search = normalizeParams(params);
    const limit = Math.min(10, Math.max(1, parseInt(search.get("limit") ?? "5", 10) || 5));

    const records = await this.queryPosts(`
      ${POST_SELECT_SQL}
      WHERE p.status IN ('published', 'draft')
        AND pt.slug = 'page'
        AND (
          p.slug = '${safeSlug}'
          OR json_extract(p.meta_values, '$.slug') = '${safeSlug}'
        )
      ORDER BY CASE WHEN p.status = 'published' THEN 0 ELSE 1 END, p.updated_at DESC
      LIMIT ${limit}
    `);

    return Promise.all(records.map((record) => enrichPageRecord(record)));
  }

  async getPostsByCategorySlug(
    categorySlug: string,
    lang?: string,
    options?: CategoryPostsOptions,
  ): Promise<LegacyPostRecord[]> {
    const safeCategory = escapeSqlLiteral(categorySlug.trim());
    if (!safeCategory) return [];

    const postTypeFilter = options?.postTypeSlug
      ? `AND (
          pt.slug = '${escapeSqlLiteral(options.postTypeSlug.trim())}'
          OR json_extract(p.meta_values, '$.posttype') = '${escapeSqlLiteral(options.postTypeSlug.trim())}'
          OR json_extract(p.meta_values, '$.legacy_posttype') = '${escapeSqlLiteral(options.postTypeSlug.trim())}'
        )`
      : `AND pt.slug = 'post'`;

    const bodyFilter = options?.requireBody ? `AND length(trim(coalesce(p.body, ''))) > 0` : "";

    const records = await this.queryPosts(`
      SELECT DISTINCT
        p.id,
        p.slug,
        p.title,
        p.excerpt,
        p.body,
        p.status,
        p.published_at,
        p.created_at,
        p.updated_at,
        p.meta_values,
        pt.slug AS post_type_slug,
        l.locale_code AS locale_code
      FROM ${EDP_TABLES.posts} p
      INNER JOIN ${EDP_TABLES.post_types} pt ON p.post_type_id = pt.id
      LEFT JOIN ${EDP_TABLES.locales} l ON p.id_locale_code = l.id
      INNER JOIN ${EDP_TABLES.posts_taxonomies} ptax ON ptax.post_id = p.id
      INNER JOIN ${EDP_TABLES.taxonomies} t ON t.id = ptax.term_id
      WHERE p.status = 'published'
        AND t.type = 'category'
        AND t.slug = '${safeCategory}'
        ${postTypeFilter}
        ${bodyFilter}
        ${metaSqlFilters(options?.meta)}
        ${localeSqlFilter(lang)}
      ORDER BY CAST(json_extract(p.meta_values, '$.order') AS INTEGER) DESC, p.title ASC
      LIMIT 500
    `);

    if (safeCategory === "equipe") {
      return Promise.all(records.map((record) => enrichEquipeRecord(record)));
    }

    if (safeCategory === "diretores") {
      return Promise.all(records.map((record) => enrichThumbnailRecord(record)));
    }

    return records;
  }

  async getJobsByCategorySlug(categorySlug: string, lang?: string): Promise<LegacyPostRecord[]> {
    const safeCategory = escapeSqlLiteral(categorySlug.trim());
    if (!safeCategory) return [];

    return this.queryPosts(`
      SELECT DISTINCT
        p.id,
        p.slug,
        p.title,
        p.excerpt,
        p.body,
        p.status,
        p.published_at,
        p.created_at,
        p.updated_at,
        p.meta_values,
        pt.slug AS post_type_slug,
        l.locale_code AS locale_code
      FROM ${EDP_TABLES.posts} p
      INNER JOIN ${EDP_TABLES.post_types} pt ON p.post_type_id = pt.id
      LEFT JOIN ${EDP_TABLES.locales} l ON p.id_locale_code = l.id
      INNER JOIN ${EDP_TABLES.posts_taxonomies} ptax ON ptax.post_id = p.id
      INNER JOIN ${EDP_TABLES.taxonomies} t ON t.id = ptax.term_id
      WHERE p.status = 'published'
        AND t.type = 'categorias'
        AND (
          t.slug = '${safeCategory}-pt-br'
          OR t.slug = '${safeCategory}-en-us'
          OR ${sqlSlugPrefixMatch("t.slug", safeCategory)}
        )
        AND (
          pt.slug = 'jobs'
          OR json_extract(p.meta_values, '$.posttype') = 'jobs'
          OR json_extract(p.meta_values, '$.legacy_posttype') = 'jobs'
        )
        ${localeSqlFilter(lang)}
      ORDER BY p.created_at DESC
      LIMIT 500
    `);
  }

  async getJobBySlug(slug: string, lang?: string): Promise<LegacyPostRecord[]> {
    const safeSlug = slug.trim();
    if (!safeSlug) return [];

    const byCategory = await this.getJobsByCategorySlug(safeSlug, lang);
    if (byCategory.length > 0) return byCategory;

    return (await this.findPostsByLegacySlug(safeSlug, 5)).filter(isJobRecord);
  }

  async getCategoriesToPosts(params?: QueryInput): Promise<Array<{ postId: number; categoryId: number }>> {
    const search = normalizeParams(params);
    const postIdEq = search.get("filters[postId][$eq]") ?? search.get("postId");

    const rows = await db
      .select({
        post_id: postsTaxonomies.post_id,
        term_id: postsTaxonomies.term_id,
      })
      .from(postsTaxonomies)
      .where(postIdEq ? eq(postsTaxonomies.post_id, parseInt(postIdEq, 10)) : undefined);

    return rows.map((row) => ({ postId: row.post_id, categoryId: row.term_id }));
  }

  async getCategories(id?: number): Promise<Array<Record<string, unknown>>> {
    const rows = await db
      .select({
        id: taxonomies.id,
        name: taxonomies.name,
        slug: taxonomies.slug,
        description: taxonomies.description,
        type: taxonomies.type,
        parent_id: taxonomies.parent_id,
      })
      .from(taxonomies)
      .where(id ? eq(taxonomies.id, id) : undefined);

    return rows.map((row) => ({
      ...row,
      title: row.name,
    }));
  }
}

export const themeContentGateway = new ThemeContentGateway();
