/**
 * API de configurações (settings).
 * GET: retorna opções por nome (query: names=site_name,site_description) ou todas autoload. Público para leitura.
 * PATCH: atualiza site_name, site_description, setup_done (body JSON). Requer admin.
 */
import type { APIRoute } from "astro";
import { db } from "../../db/index.ts";
import { requireMinRole } from "../../lib/api-auth.ts";
import { getString, getBoolean } from "../../lib/utils/form-data.ts";
import {
  badRequestResponse,
  htmxRefreshResponse,
  internalServerErrorResponse,
  jsonResponse,
} from "../../lib/utils/http-responses.ts";
import { getCacheKvFromLocals, isAuthenticatedFromLocals } from "../../lib/utils/runtime-locals.ts";
import {
  ALLOWED_PATCH_KEYS,
  createSetting,
  getSettingsWithCache,
  updateSettingsByKeys,
} from "../../lib/services/settings-service.ts";
import { invalidateSettingsCache } from "../../lib/kv-cache-sync.ts";

export const prerender = false;

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const isAuthenticated = isAuthenticatedFromLocals(locals);
    const kv = getCacheKvFromLocals(locals);
    const namesParam = url.searchParams.get("names");

    const record = await getSettingsWithCache(db, {
      namesParam,
      kv,
      isAuthenticated,
    });

    return jsonResponse(record);
  } catch (err) {
    console.error("GET /api/settings", err);
    return internalServerErrorResponse();
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  try {
    const contentType = request.headers.get("Content-Type") ?? "";
    let name: string;
    let value: string;
    let autoload: boolean;

    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      name = String(body?.name ?? "").trim();
      value = String(body?.value ?? "").trim();
      autoload = body?.autoload === true || body?.autoload === "1";
    } else {
      const formData = await request.formData();
      name = getString(formData, "name");
      value = getString(formData, "value");
      autoload = getBoolean(formData, "autoload", true);
    }

    if (!name) {
      return badRequestResponse("Name is required");
    }

    await createSetting(db, { name, value, autoload: autoload ?? true });
    await invalidateSettingsCache(locals);
    return htmxRefreshResponse();
  } catch (err) {
    console.error("POST /api/settings", err);
    return internalServerErrorResponse();
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, string>;
    if (typeof body !== "object" || body === null) {
      return badRequestResponse("Bad Request");
    }

    await updateSettingsByKeys(db, body, ALLOWED_PATCH_KEYS);
    await invalidateSettingsCache(locals);
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error("PATCH /api/settings", err);
    return internalServerErrorResponse();
  }
};
