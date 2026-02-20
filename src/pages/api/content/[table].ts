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
import { getTableNames } from "../../../lib/db-utils.ts";
import { posts } from "../../../db/schema.ts";
import { and, eq, inArray } from "drizzle-orm";
import { isValidSlug } from "../../../lib/utils/validation.ts";
import { parseMetaValues } from "../../../lib/utils/meta-parser.ts";
import { buildContentPostPayload } from "../../../lib/content-post-payload.ts";

export const prerender = false;

export const GET: APIRoute = async ({ params, url, locals }) => {
  const segment = params.table;
  if (!segment) {
    return new Response(
      JSON.stringify({ error: "invalid_param", message: "Path segment is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  type KVLike = { get(key: string, type?: "json"): Promise<unknown>; put(key: string, value: string): Promise<void> };
  const isAuthenticated = Boolean((locals as { user?: unknown })?.user);
  const kv = !isAuthenticated
    ? ((locals as { runtime?: { env?: { edgepress_cache?: KVLike | null } } }).runtime?.env?.edgepress_cache ?? null)
    : null;

  // 1) Tentar tratar como nome de tabela (identificador simples)
  const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  const allowedTables = await getTableNames(db);
  const isIdentifier = IDENTIFIER.test(segment);

  if (isIdentifier) {
    // Se é identificador mas não está na lista de tabelas conhecidas, responde 404 de tabela
    if (!allowedTables.includes(segment)) {
      return new Response(
        JSON.stringify({ error: "table_not_found", message: "Table not found or not allowed" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

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
      const result = await getTableContentWithCache({
        kv,
        db,
        table: segment,
        params: { order, orderDir, limit, page, filter: Object.keys(filter).length ? filter : undefined },
      });

      if (result.columns.includes("meta_values")) {
        result.items = result.items.map((item) => ({
          ...item,
          meta_values:
            item.meta_values != null
              ? parseMetaValues(String(item.meta_values))
              : ({} as Record<string, string>),
        }));
      }

      return new Response(JSON.stringify(result), {
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

  // 2) Caso não seja tabela conhecida, tratar como slug de post
  const slug = segment;
  if (!isValidSlug(slug)) {
    return new Response(
      JSON.stringify({ error: "invalid_slug", message: "Slug inválido" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Filtro de status: por padrão apenas 'published'
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

  // Autenticado: bypass KV e vai direto ao DB. Não autenticado: tenta KV primeiro.
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
      // Se o KV falhar, segue para o banco
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
      return new Response(
        JSON.stringify({ error: "post_not_found", message: "Post not found", slug }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const payload = await buildContentPostPayload(db, post);

    if (kv) {
      try {
        await kv.put(postCacheKey, JSON.stringify(payload));
      } catch {
        // Ignora erro de gravação no KV
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
};
