import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { locales, postTypes, posts, postsTaxonomies, taxonomies } from "../../db/schema.ts";
import { parseMetaValues } from "../utils/meta-parser.ts";

type QueryInput = Record<string, unknown> | string | null | undefined;

type LegacyPostRecord = Record<string, unknown> & {
  id: number;
  slug: string;
  title: string;
  tags: string;
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

function toLegacyTags(meta: Record<string, string>, postType: string, localeCode: string | null): string {
  const parsedTags = meta["tags"];
  if (parsedTags) return parsedTags;

  const tagsObject: Record<string, unknown> = {
    ...(localeCode ? { language: [localeCode.replace("_", "-")] } : {}),
    posttype: postType,
  };
  return JSON.stringify([JSON.stringify(tagsObject)]);
}

function mapPostRecord(
  row: {
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
  }
): LegacyPostRecord {
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
    mapped[key] = value;
  }
  return mapped;
}

export class ThemeContentGateway {
  async getPosts(params?: QueryInput): Promise<LegacyPostRecord[]> {
    const search = normalizeParams(params);
    const slugEq = search.get("filters[slug][$eq]") ?? search.get("slug");
    const limit = Math.min(1000, Math.max(1, parseInt(search.get("limit") ?? "200", 10) || 200));

    const baseRows = await db
      .select({
        id: posts.id,
        slug: posts.slug,
        title: posts.title,
        excerpt: posts.excerpt,
        body: posts.body,
        status: posts.status,
        published_at: posts.published_at,
        created_at: posts.created_at,
        updated_at: posts.updated_at,
        meta_values: posts.meta_values,
        post_type_slug: postTypes.slug,
        locale_code: locales.locale_code,
      })
      .from(posts)
      .innerJoin(postTypes, eq(posts.post_type_id, postTypes.id))
      .leftJoin(locales, eq(posts.id_locale_code, locales.id))
      .where(slugEq ? eq(posts.slug, slugEq) : undefined)
      .orderBy(desc(posts.updated_at))
      .limit(limit);

    return baseRows.map(mapPostRecord);
  }

  async getPostsByType(postTypeSlug: string, params?: QueryInput): Promise<LegacyPostRecord[]> {
    const search = normalizeParams(params);
    const slugEq = search.get("filters[slug][$eq]") ?? search.get("slug");
    const limit = Math.min(1000, Math.max(1, parseInt(search.get("limit") ?? "200", 10) || 200));

    const rows = await db
      .select({
        id: posts.id,
        slug: posts.slug,
        title: posts.title,
        excerpt: posts.excerpt,
        body: posts.body,
        status: posts.status,
        published_at: posts.published_at,
        created_at: posts.created_at,
        updated_at: posts.updated_at,
        meta_values: posts.meta_values,
        post_type_slug: postTypes.slug,
        locale_code: locales.locale_code,
      })
      .from(posts)
      .innerJoin(postTypes, eq(posts.post_type_id, postTypes.id))
      .leftJoin(locales, eq(posts.id_locale_code, locales.id))
      .where(
        and(
          eq(postTypes.slug, postTypeSlug),
          ...(slugEq ? [eq(posts.slug, slugEq)] : [])
        )
      )
      .orderBy(desc(posts.updated_at))
      .limit(limit);

    return rows.map(mapPostRecord);
  }

  async getJobBySlug(slug: string): Promise<LegacyPostRecord[]> {
    return this.getPosts({ "filters[slug][$eq]": slug, limit: "1" });
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
    return rows;
  }
}

export const themeContentGateway = new ThemeContentGateway();
