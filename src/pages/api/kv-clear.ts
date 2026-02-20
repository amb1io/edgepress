/**
 * DELETE /api/kv-clear
 * Remove todas as chaves do KV (edgepress_cache). Útil para testar a API sem cache.
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
  delete(key: string): Promise<void>;
};

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
    let cleared = 0;
    let cursor: string | undefined;
    do {
      const result = await kv.list({ limit: 1000, cursor });
      for (const key of result.keys) {
        await kv.delete(key.name);
        cleared++;
      }
      cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor);

    return new Response(
      JSON.stringify({
        ok: true,
        cleared,
        message: `Cache limpo: ${cleared} chave(s) removida(s).`,
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
