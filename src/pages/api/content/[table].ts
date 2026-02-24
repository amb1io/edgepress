/**
 * GET /api/content/[tableOrSlug]
 *
 * Comportamento:
 * - Se o segmento da rota corresponder ao nome de uma tabela conhecida (ex: /settings, /posts),
 *   retorna a listagem dinâmica dessa tabela com cache em KV.
 * - Caso contrário, trata o segmento como slug de post (ex: /titulo-do-post) e:
 *   - Busca o post pelo slug;
 *   - Busca as mídias relacionadas (attachments) e devolve em uma chave `media`;
 *   - Usa KV como cache da resposta completa do post.
 *
 * Query params da listagem de tabela: page, limit, order, orderDir, filter_<col>=value
 */
import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { getTableContentWithCache } from "../../../lib/content-cache.ts";
import { getTableNames, getContentApiRuntime, getSafeTableName, VALID_TABLE_IDENTIFIER } from "../../../lib/db-utils.ts";
import { posts } from "../../../db/schema.ts";
import { and, eq, inArray } from "drizzle-orm";
import { isValidSlug } from "../../../lib/utils/validation.ts";
import { parseMetaValues } from "../../../lib/utils/meta-parser.ts";
import { buildContentPostPayload } from "../../../lib/content-post-payload.ts";
import {
  badRequestResponse,
  errorResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
} from "../../../lib/utils/http-responses.ts";
import { HTTP_STATUS_CODES } from "../../../lib/constants/index.ts";

export const prerender = false;

export const GET: APIRoute = async ({ params, url, locals }) => {
  const segment = params["table"];
  if (!segment) {
    return badRequestResponse("Path segment is required");
  }

  const { kv } = getContentApiRuntime(locals);
  const allowedTables = await getTableNames(db);
  const safeTable = getSafeTableName(segment, allowedTables);

  if (safeTable === null && VALID_TABLE_IDENTIFIER.test(segment)) {
    return notFoundResponse("Table not found or not allowed");
  }

  // 1) Tratar como nome de tabela quando for identificador permitido
  if (safeTable !== null) {
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "10", 10) || 10));
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const order = url.searchParams.get("order") ?? undefined;
    const orderDir = (url.searchParams.get("orderDir") === "asc" ? "asc" : "desc") as "asc" | "desc";
    const filter: Record<string, string> = {};
    for (const [key, value] of url.searchParams) {
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

    try {
      const filterParam = Object.keys(filter).length ? filter : undefined;
      const result = await getTableContentWithCache({
        kv,
        db,
        table: safeTable,
        params: {
          ...(order != null && order !== "" && { order }),
          orderDir,
          limit,
          page,
          ...(filterParam != null && { filter: filterParam }),
        },
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

      return jsonResponse(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      return internalServerErrorResponse(message);
    }
  }

  // 2) If not a known table, treat as post slug
  const slug = segment;
  if (!isValidSlug(slug)) {
    return badRequestResponse("Slug inválido");
  }

  // Status filter: by default only 'published'
  const rawStatus = url.searchParams.get("status");
  const allowedStatus = new Set(["published", "draft", "archived"]);
  let statusList: string[];
  if (!rawStatus) {
    statusList = ["published"];
  } else {
    statusList = rawStatus
      .split(",")
      .map((s) => s.trim())
      .filter((s) => allowedStatus.has(s));
    if (statusList.length === 0) {
      statusList = ["published"];
    }
  }

  const statusKey = statusList.join(",");
  const postCacheKey = `post:${slug}:status=${statusKey}`;

  // Authenticated: bypass KV and go straight to DB. Unauthenticated: try KV first.
  if (kv) {
    try {
      const cached = (await kv.get(postCacheKey, "json")) as Record<string, unknown> | null;
      if (cached && typeof cached === "object") {
        return jsonResponse(cached);
      }
    } catch {
      // If KV fails, continue to DB
    }
  }

  try {
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
          : and(
              eq(posts.slug, slug),
              inArray(posts.status, statusList as typeof posts.$inferSelect.status[])
            )
      )
      .limit(1);

    const post = rows[0] as {
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
    } | undefined;
    if (!post) {
      return errorResponse("Post not found", HTTP_STATUS_CODES.NOT_FOUND, { slug });
    }

    const payload = await buildContentPostPayload(db, post);

    if (kv) {
      try {
        await kv.put(postCacheKey, JSON.stringify(payload));
      } catch {
        // Ignore KV write error
      }
    }

    return jsonResponse(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return internalServerErrorResponse(message);
  }
};
