/**
 * POST /api/post-types/load-defaults
 * Garante que os post types padrão (DEFAULT_POST_TYPES) existam no banco.
 * Requer admin. Usado pelo botão "Carregar padrões" na tela Post Types.
 */
import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { requireMinRole } from "../../../lib/api-auth.ts";
import { ensurePostTypesFromDefaults } from "../../../db/seed.ts";
import { internalServerErrorResponse, jsonResponse } from "../../../lib/utils/http-responses.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  try {
    const typeIds = await ensurePostTypesFromDefaults(db);
    return jsonResponse({ ok: true, count: Object.keys(typeIds).length });
  } catch (err) {
    console.error("POST /api/post-types/load-defaults", err);
    return internalServerErrorResponse();
  }
};
