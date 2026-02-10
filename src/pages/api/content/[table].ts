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
import { getPostMedia } from "../../../lib/services/media-service.ts";
import { isValidSlug } from "../../../lib/utils/validation.ts";
import { parseMetaValues } from "../../../lib/utils/meta-parser.ts";

export const prerender = false;

type MediaForSmartBody = {
  id: number;
  meta_values?: string | null;
};

function normalizeAttachmentPath(rawPath: string): string {
  if (!rawPath) return "";
  let path = rawPath;

  // Se vier como URL completa, extrair apenas o pathname
  try {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      path = new URL(path).pathname;
    }
  } catch {
    // ignora erro de URL inválida
  }

  // Remover prefixo /api/media ou /api se existir, para chegar em /uploads/...
  if (path.startsWith("/api/media")) {
    path = path.slice("/api/media".length);
  }
  if (path.startsWith("/api/")) {
    path = path.slice("/api".length);
  }

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  return path;
}

function buildBodySmart(
  body: string | null | undefined,
  media: MediaForSmartBody[] | null | undefined
): string {
  if (!body) return "";

  const mediaList = Array.isArray(media) ? media : [];

  // Mapa: attachment_path normalizado -> id da mídia
  const pathToId = new Map<string, number>();
  for (const media of mediaList) {
    const meta = parseMetaValues(media.meta_values ?? null);
    const attachmentPath = meta.attachment_path;
    if (attachmentPath) {
      const normalized = normalizeAttachmentPath(attachmentPath);
      pathToId.set(normalized, media.id);
    }
  }

  let seq = 0;

  return body.replace(/<img\b[^>]*>/gi, (imgTag) => {
    // Extrair src ou data-url da tag <img>
    const attrMatch = imgTag.match(/\s(?:data-url|src)=["']([^"']+)["']/i);
    const url = attrMatch?.[1] ?? "";

    let tokenId: number;
    if (url) {
      const normalized = normalizeAttachmentPath(url);
      const foundId = pathToId.get(normalized);
      if (typeof foundId === "number") {
        tokenId = foundId;
      } else {
        // fallback: sequência se não houver match exato
        tokenId = ++seq;
      }
    } else {
      // se não tiver URL, ainda assim gera um token sequencial
      tokenId = ++seq;
    }

    return `{media_${tokenId}}`;
  });
}

export const GET: APIRoute = async ({ params, url, locals }) => {
  const segment = params.table;
  if (!segment) {
    return new Response(
      JSON.stringify({ error: "invalid_param", message: "Path segment is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  type KVLike = { get(key: string, type?: "json"): Promise<unknown>; put(key: string, value: string): Promise<void> };
  const kv = (locals as { runtime?: { env?: { edgepress_cache?: KVLike | null } } }).runtime?.env?.edgepress_cache ?? null;

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
      if (key.startsWith("filter_") && value) filter[key.replace(/^filter_/, "")] = value;
    }

    try {
      const result = await getTableContentWithCache({
        kv: kv ?? null,
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

  // Primeiro, tentar o KV pela chave do slug
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

    const media = await getPostMedia(db as never, post.id);
    const meta = parseMetaValues(post.meta_values);
    const body_smart = buildBodySmart(post.body, media as MediaForSmartBody[]);

    const mediaWithParsedMeta = (media as { meta_values?: string | null }[]).map((m) => ({
      ...m,
      meta_values: parseMetaValues(m.meta_values ?? null),
    }));

    const payload = {
      ...post,
      meta_values: meta,
      body_smart,
      media: mediaWithParsedMeta,
    };

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
