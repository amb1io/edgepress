/**
 * GET /api/kv-list
 * Lista todas as chaves do KV (edgepress_cache) com prévia do valor.
 * Requer autenticação de administrador.
 */
import type { APIRoute } from "astro";
import { requireMinRole } from "../../lib/api-auth.ts";

export const prerender = false;

type KVLike = {
  list(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string;
  }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
  get(key: string, type?: "text" | "json"): Promise<string | unknown | null>;
};

const MAX_KEYS = 500;
const VALUE_PREVIEW_LENGTH = 200;

export const GET: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const kv =
    (locals as { runtime?: { env?: { edgepress_cache?: KVLike | null } } })
      .runtime?.env?.edgepress_cache ?? null;

  if (!kv) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: "KV (edgepress_cache) not configured",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const items: { key: string; valuePreview: string }[] = [];
    let cursor: string | undefined;
    let total = 0;

    do {
      const result = await kv.list({ limit: 100, cursor });
      for (const { name } of result.keys) {
        if (total >= MAX_KEYS) break;
        let valuePreview = "—";
        try {
          const raw = await kv.get(name, "text");
          if (raw != null && typeof raw === "string") {
            valuePreview =
              raw.length <= VALUE_PREVIEW_LENGTH
                ? raw
                : raw.slice(0, VALUE_PREVIEW_LENGTH) + "…";
          }
        } catch {
          valuePreview = "(erro ao ler)";
        }
        items.push({ key: name, valuePreview });
        total++;
      }
      cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor && total < MAX_KEYS);

    return new Response(
      JSON.stringify({
        ok: true,
        items,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "KV error";
    return new Response(JSON.stringify({ ok: false, message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
