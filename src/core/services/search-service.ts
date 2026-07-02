/**
 * Full-text search (FTS5) para posts no D1.
 * Índice: title, body, taxonomy, custom_fields.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "../../utils/types/database.ts";
import { posts, postTypes, postsTaxonomies } from "../../db/schema.ts";
import { stripHtml } from "./json-ld-service.ts";
import {
  getPostCustomFields,
  getPostTaxonomiesForPayload,
  type PostRow,
} from "../../utils/content-post-payload.ts";
import { extractPlainTextFromBodyBlocks } from "../../utils/extract-plain-text-from-body-blocks.ts";
import { getPostTypeId } from "./post-service.ts";

export const NON_SEARCHABLE_POST_TYPE_SLUGS = new Set([
  "attachment",
  "themes",
  "user",
  "translations_languages",
  "post_type",
  "settings",
  "dashboard",
  "custom_fields",
  "menus",
]);

export function isSearchablePostType(slug: string): boolean {
  return !NON_SEARCHABLE_POST_TYPE_SLUGS.has(slug.trim().toLowerCase());
}

export type PostSearchDocument = {
  title: string;
  body: string;
  taxonomy: string;
  custom_fields: string;
};

export type SearchPostsParams = {
  q: string;
  localeId: number;
  page?: number;
  limit?: number;
  post_type?: string;
};

export type SearchPostsHit = {
  post_id: number;
  rank: number;
};

export type SearchPostsResult = {
  hits: SearchPostsHit[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  q: string;
};

async function runSql(
  db: Database,
  statement: ReturnType<typeof sql> | ReturnType<typeof sql.raw>,
): Promise<void> {
  if ("run" in db && typeof db.run === "function") {
    await db.run(statement);
    return;
  }
  await db.all(statement);
}

/** Escapa termos para FTS5 MATCH (tokens AND implícito). */
export function sanitizeFtsQuery(q: string): string | null {
  const trimmed = q.trim();
  if (!trimmed) return null;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  return tokens
    .map((token) => token.replace(/"/g, '""'))
    .map((token) => `"${token}"`)
    .join(" ");
}

function hasText(value: string | null | undefined): boolean {
  return String(value ?? "").trim().length > 0;
}

export function buildBodySearchText(body: string | null, bodyBlocks: string | null): string {
  const parts: string[] = [];

  if (hasText(body)) {
    const plain = stripHtml(body).trim();
    if (plain) parts.push(plain);
  }

  if (hasText(bodyBlocks)) {
    const fromBlocks = extractPlainTextFromBodyBlocks(bodyBlocks);
    if (fromBlocks) parts.push(fromBlocks);
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export async function buildPostSearchDocument(
  db: Database,
  post: PostRow,
  postTypeSlug: string,
): Promise<PostSearchDocument | null> {
  if (!isSearchablePostType(postTypeSlug) || post.status === "trash") {
    return null;
  }

  const [taxonomiesList, customFields] = await Promise.all([
    getPostTaxonomiesForPayload(db, post.id),
    getPostCustomFields(db, post.id),
  ]);

  const taxonomy = taxonomiesList
    .flatMap((term) => [term.name, term.slug, term.description ?? ""].filter(hasText))
    .join(" ")
    .trim();

  const custom_fields = customFields
    .flatMap((block) => {
      const fieldParts = [block.title];
      for (const field of block.fields) {
        if (hasText(field.name)) fieldParts.push(field.name);
        if (hasText(field.value)) fieldParts.push(stripHtml(field.value).trim());
      }
      return fieldParts;
    })
    .join(" ")
    .trim();

  return {
    title: post.title.trim(),
    body: buildBodySearchText(post.body, post.body_blocks),
    taxonomy,
    custom_fields,
  };
}

export async function removePostFromSearchIndex(db: Database, postId: number): Promise<void> {
  await runSql(db, sql`DELETE FROM edp_posts_fts WHERE rowid = ${postId}`);
}

export async function syncPostSearchIndex(db: Database, postId: number): Promise<void> {
  const [row] = await db
    .select({
      id: posts.id,
      post_type_id: posts.post_type_id,
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      body: posts.body,
      body_blocks: posts.body_blocks,
      status: posts.status,
      meta_values: posts.meta_values,
      published_at: posts.published_at,
      created_at: posts.created_at,
      updated_at: posts.updated_at,
      parent_id: posts.parent_id,
      author_id: posts.author_id,
      id_locale_code: posts.id_locale_code,
      post_type_slug: postTypes.slug,
    })
    .from(posts)
    .innerJoin(postTypes, eq(posts.post_type_id, postTypes.id))
    .where(eq(posts.id, postId))
    .limit(1);

  await removePostFromSearchIndex(db, postId);

  if (!row) return;

  const post: PostRow = {
    id: row.id,
    post_type_id: row.post_type_id,
    parent_id: row.parent_id,
    author_id: row.author_id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    body: row.body,
    body_blocks: row.body_blocks,
    status: row.status ?? "draft",
    meta_values: row.meta_values,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  const document = await buildPostSearchDocument(db, post, row.post_type_slug);
  if (!document) return;

  await runSql(
    db,
    sql`
      INSERT INTO edp_posts_fts (
        rowid, post_id, post_type_id, status, id_locale_code,
        title, body, taxonomy, custom_fields
      ) VALUES (
        ${postId},
        ${postId},
        ${row.post_type_id},
        ${row.status ?? "draft"},
        ${row.id_locale_code},
        ${document.title},
        ${document.body},
        ${document.taxonomy},
        ${document.custom_fields}
      )
    `,
  );
}

export async function reindexPostsByTaxonomyId(db: Database, termId: number): Promise<void> {
  const rows = await db
    .select({ post_id: postsTaxonomies.post_id })
    .from(postsTaxonomies)
    .where(eq(postsTaxonomies.term_id, termId));

  for (const row of rows) {
    await syncPostSearchIndex(db, row.post_id);
  }
}

export async function backfillAllSearchIndexes(db: Database): Promise<number> {
  const typeRows = await db.select({ id: postTypes.id, slug: postTypes.slug }).from(postTypes);
  const searchableTypeIds = typeRows
    .filter((row) => isSearchablePostType(row.slug))
    .map((row) => row.id);

  if (searchableTypeIds.length === 0) return 0;

  const postRows = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(inArray(posts.post_type_id, searchableTypeIds), ne(posts.status, "trash")));

  let count = 0;
  for (const row of postRows) {
    await syncPostSearchIndex(db, row.id);
    count += 1;
  }
  return count;
}

type FtsCountRow = { total: number };
type FtsHitRow = { post_id: number; rank: number };

export async function searchPosts(db: Database, params: SearchPostsParams): Promise<SearchPostsResult | null> {
  const matchQuery = sanitizeFtsQuery(params.q);
  if (!matchQuery) {
    return {
      hits: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      q: params.q,
    };
  }

  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const offset = (page - 1) * limit;

  let postTypeId: number | null = null;
  if (params.post_type?.trim()) {
    postTypeId = await getPostTypeId(db, params.post_type.trim());
    if (postTypeId == null) {
      return {
        hits: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
        q: params.q,
      };
    }
  }

  const filterPostType =
    postTypeId != null ? sql` AND post_type_id = ${postTypeId}` : sql``;
  const filterLocale = sql` AND id_locale_code = ${params.localeId}`;

  const countRows = (await db.all(sql`
    SELECT COUNT(*) AS total
    FROM edp_posts_fts
    WHERE edp_posts_fts MATCH ${matchQuery}
      AND status = 'published'
      ${filterPostType}
      ${filterLocale}
  `)) as FtsCountRow[];

  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  if (total === 0) {
    return { hits: [], total: 0, page, limit, totalPages: 0, q: params.q };
  }

  const hitRows = (await db.all(sql`
    SELECT post_id, bm25(edp_posts_fts) AS rank
    FROM edp_posts_fts
    WHERE edp_posts_fts MATCH ${matchQuery}
      AND status = 'published'
      ${filterPostType}
      ${filterLocale}
    ORDER BY rank
    LIMIT ${limit} OFFSET ${offset}
  `)) as FtsHitRow[];

  const hits = hitRows.map((row) => ({
    post_id: Number(row.post_id),
    rank: Number(row.rank),
  }));

  return { hits, total, page, limit, totalPages, q: params.q };
}
