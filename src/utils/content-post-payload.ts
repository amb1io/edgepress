/**
 * Monta o payload hierárquico de um post para a API content:
 * - Objeto pai: post (post_type em questão)
 * - Dentro: meta_schema (JSON), meta_values (JSON), custom_fields (JSON), body_smart, media, taxonomies
 */
import { eq, and, inArray } from "drizzle-orm";
import type { Database } from "./types/database.ts";
import { posts, postTypes, postsTaxonomies, taxonomies } from "../db/schema.ts";
import { getPostMedia } from "./services/media-service.ts";
import { getPostTypeId } from "./services/post-service.ts";
import { parseMetaValues } from "./meta-parser.ts";
import { buildBodySmart, type MediaForSmartBody } from "./content-post-detail.ts";
import {
  getSeoMetadataForPost,
  buildSeoApiPayload,
  type SeoApiPayload,
} from "./services/seo-metadata-service.ts";
import { buildPostJsonLd } from "./services/json-ld-service.ts";

export type PostRow = {
  id: number;
  post_type_id: number;
  parent_id: number | null;
  author_id: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  body_blocks: string | null;
  status: string;
  meta_values: string | null;
  published_at: number | null;
  created_at: number | null;
  updated_at: number | null;
};

export type CustomFieldItem = {
  id: number;
  title: string;
  slug: string;
  fields: Array<{ name: string; value: string; type?: string }>;
  template?: boolean;
  field_type?: string[];
};

/** Meta schema do post_types (array de { key, type, default? }) */
export type MetaSchemaItem = { key: string; type: string; default?: unknown };

/** Termo de taxonomia associado ao post (para o payload da API). */
export type PostTaxonomyItem = {
  id: number;
  name: string;
  slug: string;
  type: string;
  description: string | null;
  parent_id: number | null;
};

/** Busca taxonomias vinculadas ao post (para incluir no payload da API content). */
export async function getPostTaxonomiesForPayload(
  db: Database,
  postId: number
): Promise<PostTaxonomyItem[]> {
  const rows = await db
    .select({
      id: taxonomies.id,
      name: taxonomies.name,
      slug: taxonomies.slug,
      type: taxonomies.type,
      description: taxonomies.description,
      parent_id: taxonomies.parent_id,
    })
    .from(postsTaxonomies)
    .innerJoin(taxonomies, eq(postsTaxonomies.term_id, taxonomies.id))
    .where(eq(postsTaxonomies.post_id, postId));
  return rows as PostTaxonomyItem[];
}

/** Busca meta_schema do tipo do post (post_types.meta_schema) como JSON estruturado. */
export async function getPostMetaSchema(
  db: Database,
  postTypeId: number
): Promise<MetaSchemaItem[]> {
  const [row] = await db
    .select({ meta_schema: postTypes.meta_schema })
    .from(postTypes)
    .where(eq(postTypes.id, postTypeId))
    .limit(1);
  if (!row?.meta_schema) return [];
  return Array.isArray(row.meta_schema) ? (row.meta_schema as MetaSchemaItem[]) : [];
}

type CustomFieldRow = {
  id: number;
  title: string;
  slug: string;
  meta_values: string | null;
};

function mapCustomFieldRow(r: CustomFieldRow): CustomFieldItem {
  const meta = parseMetaValues(r.meta_values);
  const fields = Array.isArray(meta.fields) ? meta.fields : [];
  return {
    id: r.id,
    title: r.title,
    slug: r.slug,
    fields: fields.map((f: { name?: string; value?: string; type?: string }) => ({
      name: String(f?.name ?? ""),
      value: String(f?.value ?? ""),
      type: f?.type,
    })),
    template: Boolean(meta.template),
    field_type: Array.isArray(meta.field_type) ? meta.field_type : undefined,
  };
}

/** Busca custom fields (posts filhos tipo custom_fields) e devolve como JSON estruturado. */
export async function getPostCustomFields(
  db: Database,
  postId: number
): Promise<CustomFieldItem[]> {
  const customFieldsTypeId = await getPostTypeId(db, "custom_fields");
  if (!customFieldsTypeId) return [];

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      meta_values: posts.meta_values,
    })
    .from(posts)
    .where(and(eq(posts.parent_id, postId), eq(posts.post_type_id, customFieldsTypeId)));

  return rows.map(mapCustomFieldRow);
}

/** D1 allows at most 100 bound parameters per query; reserve 1 for post_type_id. */
export const CUSTOM_FIELDS_BATCH_CHUNK_SIZE = 99;

/** Busca custom fields de vários posts em queries em lote (agrupado por parent_id). */
export async function getPostsCustomFieldsBatch(
  db: Database,
  postIds: number[],
): Promise<Map<number, CustomFieldItem[]>> {
  const result = new Map<number, CustomFieldItem[]>();
  const uniqueIds = [...new Set(postIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (uniqueIds.length === 0) return result;

  const customFieldsTypeId = await getPostTypeId(db, "custom_fields");
  if (!customFieldsTypeId) return result;

  for (let i = 0; i < uniqueIds.length; i += CUSTOM_FIELDS_BATCH_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CUSTOM_FIELDS_BATCH_CHUNK_SIZE);
    const rows = await db
      .select({
        id: posts.id,
        parent_id: posts.parent_id,
        title: posts.title,
        slug: posts.slug,
        meta_values: posts.meta_values,
      })
      .from(posts)
      .where(
        and(
          inArray(posts.parent_id, chunk),
          eq(posts.post_type_id, customFieldsTypeId),
        ),
      );

    for (const row of rows) {
      const parentId = row.parent_id;
      if (parentId == null) continue;
      const item = mapCustomFieldRow(row);
      const list = result.get(parentId) ?? [];
      list.push(item);
      result.set(parentId, list);
    }
  }

  return result;
}

/** Monta o payload completo do post com hierarquia: post (pai) + meta_schema, meta_values, custom_fields, body_smart, media, taxonomies. */
export type BuildContentPostPayloadOptions = {
  baseUrl?: string;
};

export async function buildContentPostPayload(
  db: Database,
  post: PostRow,
  options?: BuildContentPostPayloadOptions,
): Promise<{
  id: number;
  post_type_id: number;
  author_id: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  body_blocks: string | null;
  status: string;
  published_at: number | null;
  created_at: number | null;
  updated_at: number | null;
  body_smart: string;
  media: Record<string, unknown>[];
  meta_schema: MetaSchemaItem[];
  meta_values: Record<string, unknown>;
  custom_fields: CustomFieldItem[];
  taxonomies: PostTaxonomyItem[];
  post_type_slug: string;
  seo: SeoApiPayload | null;
  json_ld: Record<string, unknown>[];
}> {
  const [meta_schema, custom_fields, media, taxonomiesList, seoRow, postTypeRow] =
    await Promise.all([
      getPostMetaSchema(db, post.post_type_id),
      getPostCustomFields(db, post.id),
      getPostMedia(db as never, post.id),
      getPostTaxonomiesForPayload(db, post.id),
      getSeoMetadataForPost(db, post.id),
      db
        .select({ slug: postTypes.slug })
        .from(postTypes)
        .where(eq(postTypes.id, post.post_type_id))
        .limit(1),
    ]);

  const post_type_slug = postTypeRow[0]?.slug ?? "";
  const meta_values = parseMetaValues(post.meta_values) as Record<string, unknown>;
  const body_smart = buildBodySmart(post.body, media as MediaForSmartBody[]);
  const mediaWithParsedMeta = (media as { meta_values?: string | null }[]).map((m) => ({
    ...m,
    meta_values: parseMetaValues(m.meta_values ?? null),
  }));

  const seo = buildSeoApiPayload(seoRow, options?.baseUrl, post.slug);

  const json_ld = await buildPostJsonLd(
    db,
    {
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      body: post.body,
      author_id: post.author_id,
      parent_id: post.parent_id,
      published_at: post.published_at,
      created_at: post.created_at,
      updated_at: post.updated_at,
      meta_values,
    },
    {
      post_type_slug,
      seo,
      baseUrl: options?.baseUrl,
      media: mediaWithParsedMeta as Record<string, unknown>[],
    },
  );

  return {
    id: post.id,
    post_type_id: post.post_type_id,
    parent_id: post.parent_id,
    author_id: post.author_id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    body: post.body,
    body_blocks: post.body_blocks,
    status: post.status,
    published_at: post.published_at,
    created_at: post.created_at,
    updated_at: post.updated_at,
    body_smart,
    media: mediaWithParsedMeta as Record<string, unknown>[],
    meta_schema,
    meta_values,
    custom_fields,
    taxonomies: taxonomiesList,
    post_type_slug,
    seo,
    json_ld,
  };
}
