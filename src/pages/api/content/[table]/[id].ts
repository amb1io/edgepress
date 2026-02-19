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
import { getTableNames } from "../../../../lib/db-utils.ts";
import { posts } from "../../../../db/schema.ts";
import { getPostMedia } from "../../../../lib/services/media-service.ts";
import { parseMetaValues } from "../../../../lib/utils/meta-parser.ts";
import { isValidSlug } from "../../../../lib/utils/validation.ts";
import { buildBodySmart, type MediaForSmartBody } from "../../../../lib/content-post-detail.ts";

export const prerender = false;

const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function escapeIdentifier(name: string): string {
  return name.replace(/"/g, '""');
}

type KVLike = { get(key: string, type?: "json"): Promise<unknown>; put(key: string, value: string): Promise<void> };

function buildPostPayload(
  post: {
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
  },
  media: { meta_values?: string | null }[]
) {
  const meta = parseMetaValues(post.meta_values);
  const body_smart = buildBodySmart(post.body, media as MediaForSmartBody[]);
  const mediaWithParsedMeta = media.map((m) => ({
    ...m,
    meta_values: parseMetaValues(m.meta_values ?? null),
  }));
  return { ...post, meta_values: meta, body_smart, media: mediaWithParsedMeta };
}

export const GET: APIRoute = async ({ params, url, locals }) => {
  const tableParam = params.table;
  const idOrSlug = params.id;

  if (!tableParam || idOrSlug === undefined || idOrSlug === "") {
    return new Response(
      JSON.stringify({ error: "invalid_param", message: "Table and id or slug are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const isNumericId = /^\d+$/.test(idOrSlug);
  const idNum = isNumericId ? parseInt(idOrSlug, 10) : null;

  const isAuthenticated = Boolean((locals as { user?: unknown })?.user);
  const kv = !isAuthenticated
    ? ((locals as { runtime?: { env?: { edgepress_cache?: KVLike | null } } }).runtime?.env?.edgepress_cache ?? null)
    : null;

  const allowedTables = await getTableNames(db);
  const safeTable = VALID_IDENTIFIER.test(tableParam) ? tableParam : null;
  if (!safeTable || !allowedTables.includes(safeTable)) {
    return new Response(
      JSON.stringify({ error: "table_not_found", message: "Table not found or not allowed" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // --- Posts: por id (numérico) ou por slug
  if (safeTable === "posts") {
    const bySlug = !isNumericId;
    if (bySlug && !isValidSlug(idOrSlug)) {
      return new Response(
        JSON.stringify({ error: "invalid_slug", message: "Slug inválido" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
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
          return new Response(JSON.stringify(cached), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch {
        // segue para o banco
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
        return new Response(
          JSON.stringify({
            error: "post_not_found",
            message: "Post not found",
            ...(bySlug ? { slug: idOrSlug } : { id: idNum }),
          }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      const media = await getPostMedia(db as never, post.id);
      const payload = buildPostPayload(post, media as { meta_values?: string | null }[]);

      if (kv) {
        try {
          await kv.put(postCacheKey, JSON.stringify(payload));
        } catch {
          // ignora
        }
      }

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      return new Response(JSON.stringify({ error: "server_error", message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // --- Outras tabelas: apenas id numérico
  if (!isNumericId || idNum === null || idNum < 1) {
    return new Response(
      JSON.stringify({ error: "invalid_id", message: "For this table only numeric id is supported" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const quotedTable = `"${escapeIdentifier(safeTable)}"`;
    const countQuery = sql.raw(`SELECT * FROM ${quotedTable} WHERE "id" = ${idNum} LIMIT 1`);
    const rows = await db.all(countQuery) as Record<string, unknown>[];
    const row = rows?.[0];

    if (!row || typeof row !== "object") {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Record not found", table: safeTable, id: idNum }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if ("meta_values" in row && row.meta_values != null) {
      (row as Record<string, unknown>).meta_values = parseMetaValues(String(row.meta_values));
    }

    return new Response(JSON.stringify(row), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(JSON.stringify({ error: "server_error", message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
