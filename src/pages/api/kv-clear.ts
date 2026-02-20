/**
 * DELETE /api/kv-clear
 * Remove todas as chaves do KV (edgepress_cache). Útil para testar a API sem cache.
 * Requer autenticação de administrador.
 */
import type { APIRoute } from "astro";
import { requireMinRole } from "../../lib/api-auth.ts";
import { getKvFromLocals } from "../../lib/utils/runtime-locals.ts";
import { htmxRefreshResponse, internalServerErrorResponse } from "../../lib/utils/http-responses.ts";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const kv = getKvFromLocals(locals);

  if (!kv || typeof kv.list !== "function" || typeof kv.delete !== "function") {
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
      const result = await kv.list!({ limit: 1000, ...(cursor !== undefined && { cursor }) });
      for (const key of result.keys) {
        await kv.delete(key.name);
        cleared++;
      }
      cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor);

    const isHtmx = request.headers.get("HX-Request") === "true";
    if (isHtmx) {
      return htmxRefreshResponse();
    }
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
    return internalServerErrorResponse(message);
  }
};
