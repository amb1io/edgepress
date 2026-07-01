/**
 * GET /api/search — Busca full-text pública em posts publicados.
 *
 * Query params: q (obrigatório), page, limit, post_type, locale
 */
import type { APIRoute } from "astro";
import { inArray } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { posts } from "../../db/schema.ts";
import { searchPosts } from "../../core/services/search-service.ts";
import { buildContentPostPayload } from "../../utils/content-post-payload.ts";
import {
  badRequestResponse,
  internalServerErrorResponse,
  jsonResponse,
} from "../../utils/http-responses.ts";

export const prerender = false;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return badRequestResponse("q é obrigatório");
  }

  const page = parsePositiveInt(url.searchParams.get("page"), 1);
  const limit = Math.min(
    MAX_LIMIT,
    parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT),
  );
  const post_type = url.searchParams.get("post_type")?.trim() || undefined;
  const locale = url.searchParams.get("locale")?.trim() || undefined;

  try {
    const result = await searchPosts(db, { q, page, limit, post_type, locale });
    if (!result) {
      return badRequestResponse("Termo de busca inválido");
    }

    if (result.hits.length === 0) {
      return jsonResponse({
        items: [],
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        q: result.q,
      });
    }

    const postIds = result.hits.map((hit) => hit.post_id);
    const rankByPostId = new Map(result.hits.map((hit) => [hit.post_id, hit.rank]));

    const postRows = await db
      .select({
        id: posts.id,
        post_type_id: posts.post_type_id,
        parent_id: posts.parent_id,
        author_id: posts.author_id,
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
      })
      .from(posts)
      .where(inArray(posts.id, postIds));

    const postById = new Map(postRows.map((row) => [row.id, row]));
    const baseUrl = url.origin;

    const items = await Promise.all(
      postIds.map(async (postId) => {
        const post = postById.get(postId);
        if (!post) return null;
        const payload = await buildContentPostPayload(db, {
          ...post,
          status: post.status ?? "draft",
        }, { baseUrl });
        return {
          ...payload,
          rank: rankByPostId.get(postId) ?? 0,
        };
      }),
    );

    return jsonResponse({
      items: items.filter((item): item is NonNullable<typeof item> => item != null),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      q: result.q,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return internalServerErrorResponse(message);
  }
};
