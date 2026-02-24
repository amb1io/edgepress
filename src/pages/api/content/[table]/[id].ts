/**
 * GET /api/content/[table]/[id_or_slug]
 *
 * Retorna um único registro por ID ou slug.
 * - Se table = "posts": aceita id (numérico) ou slug no segundo segmento. Query ?status= opcional (padrão published).
 * - Para outras tabelas: apenas id numérico (SELECT * FROM table WHERE id = ?).
 * Cache: não autenticado usa KV primeiro (só para posts); autenticado bypass KV.
 */
import type { APIRoute } from "astro";
import { sql, eq, and, inArray } from "drizzle-orm";
import { db } from "../../../../db/index.ts";
import { getTableNames, getContentApiRuntime, getSafeTableName, escapeIdentifier } from "../../../../lib/db-utils.ts";
import { posts } from "../../../../db/schema.ts";
import { parseMetaValues } from "../../../../lib/utils/meta-parser.ts";
import { isValidSlug } from "../../../../lib/utils/validation.ts";
import { buildContentPostPayload } from "../../../../lib/content-post-payload.ts";
import {
  badRequestResponse,
  errorResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
} from "../../../../lib/utils/http-responses.ts";
import { HTTP_STATUS_CODES } from "../../../../lib/constants/index.ts";

export const prerender = false;

export const GET: APIRoute = async ({ params, url, locals }) => {
  const tableParam = params.table;
  const idOrSlug = params.id;

  if (!tableParam || idOrSlug === undefined || idOrSlug === "") {
    return badRequestResponse("Table and id or slug are required");
  }

  const isNumericId = /^\d+$/.test(idOrSlug);
  const idNum = isNumericId ? parseInt(idOrSlug, 10) : null;

  const { kv } = getContentApiRuntime(locals);
  const allowedTables = await getTableNames(db);
  const safeTable = getSafeTableName(tableParam, allowedTables);
  if (!safeTable) {
    return notFoundResponse("Table not found or not allowed");
  }

  // --- Posts: by id (numeric) or by slug
  if (safeTable === "posts") {
    const bySlug = !isNumericId;
    if (bySlug && !isValidSlug(idOrSlug)) {
      return badRequestResponse("Slug inválido");
    }

    const rawStatus = url.searchParams.get("status");
    const allowedStatus = new Set(["published", "draft", "archived"]);
    let statusList: string[];
    if (!rawStatus) {
      statusList = ["published"];
    } else {
      statusList = rawStatus.split(",").map((s) => s.trim()).filter((s) => allowedStatus.has(s));
      if (statusList.length === 0) statusList = ["published"];
    }
    const statusKey = statusList.join(",");
    const postCacheKey = bySlug ? `post:${idOrSlug}:status=${statusKey}` : `post:id:${idNum}`;

    if (kv) {
      try {
        const cached = (await kv.get(postCacheKey, "json")) as Record<string, unknown> | null;
        if (cached && typeof cached === "object") {
          return jsonResponse(cached);
        }
      } catch {
        // continue to DB
      }
    }

    try {
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
        return errorResponse("Post not found", HTTP_STATUS_CODES.NOT_FOUND, bySlug ? { slug: idOrSlug } : { id: idNum });
      }

      const payload = await buildContentPostPayload(db, post);

      if (kv) {
        try {
          await kv.put(postCacheKey, JSON.stringify(payload));
        } catch {
          // ignora
        }
      }

      return jsonResponse(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      return internalServerErrorResponse(message);
    }
  }

  // --- Other tables: numeric id only
  if (!isNumericId || idNum === null || idNum < 1) {
    return badRequestResponse("For this table only numeric id is supported");
  }

  try {
    const quotedTable = `"${escapeIdentifier(safeTable)}"`;
    const countQuery = sql.raw(`SELECT * FROM ${quotedTable} WHERE "id" = ${idNum} LIMIT 1`);
    const rows = await db.all(countQuery) as Record<string, unknown>[];
    const row = rows?.[0];

    if (!row || typeof row !== "object") {
      return errorResponse("Record not found", HTTP_STATUS_CODES.NOT_FOUND, { table: safeTable, id: idNum });
    }

    if ("meta_values" in row && row.meta_values != null) {
      (row as Record<string, unknown>).meta_values = parseMetaValues(String(row.meta_values));
    }

    return jsonResponse(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return internalServerErrorResponse(message);
  }
};
