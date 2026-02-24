/**
 * Monta o payload hierárquico de um post para a API content:
 * - Objeto pai: post (post_type em questão)
 * - Dentro: meta_schema (JSON), meta_values (JSON), custom_fields (JSON), body_smart, media
 */
import { eq, and } from "drizzle-orm";
import type { Database } from "./types/database.ts";
import { posts, postTypes } from "../db/schema.ts";
import { getPostMedia } from "./services/media-service.ts";
import { getPostTypeId } from "./services/post-service.ts";
import { parseMetaValues } from "./utils/meta-parser.ts";
import { buildBodySmart, type MediaForSmartBody } from "./content-post-detail.ts";

export type PostRow = {
  id: number;
  post_type_id: number;
  author_id: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
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

  return rows.map((r) => {
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
  });
}

/** Monta o payload completo do post com hierarquia: post (pai) + meta_schema, meta_values, custom_fields, body_smart, media. */
export async function buildContentPostPayload(
  db: Database,
  post: PostRow
): Promise<{
  id: number;
  post_type_id: number;
  author_id: string | null;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  status: string;
  published_at: number | null;
  created_at: number | null;
  updated_at: number | null;
  body_smart: string;
  media: Record<string, unknown>[];
  meta_schema: MetaSchemaItem[];
  meta_values: Record<string, unknown>;
  custom_fields: CustomFieldItem[];
}> {
  const [meta_schema, custom_fields, media] = await Promise.all([
    getPostMetaSchema(db, post.post_type_id),
    getPostCustomFields(db, post.id),
    getPostMedia(db as never, post.id),
  ]);

  const meta_values = parseMetaValues(post.meta_values) as Record<string, unknown>;
  const body_smart = buildBodySmart(post.body, media as MediaForSmartBody[]);
  const mediaWithParsedMeta = (media as { meta_values?: string | null }[]).map((m) => ({
    ...m,
    meta_values: parseMetaValues(m.meta_values ?? null),
  }));

  return {
    id: post.id,
    post_type_id: post.post_type_id,
    author_id: post.author_id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    body: post.body,
    status: post.status,
    published_at: post.published_at,
    created_at: post.created_at,
    updated_at: post.updated_at,
    body_smart,
    media: mediaWithParsedMeta as Record<string, unknown>[],
    meta_schema,
    meta_values,
    custom_fields,
  };
}
