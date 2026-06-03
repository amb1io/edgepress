/**
 * GET /api/kv-list
 * Lista todas as chaves do KV (edgepress_cache) com prévia do valor.
 * Requer autenticação de administrador.
 */
import type { APIRoute } from "astro";
import { requireMinRole } from "../../utils/api-auth.ts";
import { listKvCacheEntries } from "../../utils/kv-list-entries.ts";
import { getKvFromLocals } from "../../utils/runtime-locals.ts";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const result = await listKvCacheEntries(getKvFromLocals(locals));

  if (!result.ok) {
    return new Response(JSON.stringify({ ok: false, message: result.message }), {
      status: result.message.includes("not configured") ? 503 : 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, items: result.items }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
