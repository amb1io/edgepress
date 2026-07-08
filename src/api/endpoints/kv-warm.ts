/**
 * POST /api/kv-warm
 * Pré-popula chaves KV críticas (tema, settings, menus, taxonomias).
 * Requer autenticação de administrador.
 */
import type { APIRoute } from "astro";
import { requireMinRole } from "../../utils/api-auth.ts";
import { getKvFromLocals } from "../../utils/runtime-locals.ts";
import { htmxRefreshResponse, internalServerErrorResponse } from "../../utils/http-responses.ts";
import { db } from "../../db/index.ts";
import { env as cfEnv } from "cloudflare:workers";
import { warmKvCache } from "../../core/services/kv-warmup.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const kv = getKvFromLocals(locals);
  if (!kv) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: "KV (CACHE) not configured",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const bucket = cfEnv.MEDIA_BUCKET ?? null;
    const result = await warmKvCache(db, kv, bucket);
    const isHtmx = request.headers.get("HX-Request") === "true";
    if (isHtmx) {
      return htmxRefreshResponse();
    }
    return new Response(
      JSON.stringify({
        ok: true,
        message: "KV warm-up concluído.",
        result,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "KV warm-up error";
    return internalServerErrorResponse(message);
  }
};
