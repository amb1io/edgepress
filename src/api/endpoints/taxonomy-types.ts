/**
 * API de tipos de taxonomia (registry global: category, tag + custom taxonomyType).
 */
import type { APIRoute } from "astro";
import { db } from "../../db/index.ts";
import { requireMinRole } from "../../utils/api-auth.ts";
import {
  badRequestResponse,
  internalServerErrorResponse,
  jsonResponse,
} from "../../utils/http-responses.ts";
import {
  createTaxonomyType,
  listTaxonomyTypes,
  type TaxonomyTranslationInput,
} from "../../core/services/taxonomy-type-registry.ts";
import { invalidateContentListByTable, invalidateI18nCache, invalidateTaxonomyCache } from "../../utils/kv-cache-sync.ts";
import { invalidateTranslationsCache } from "../../i18n/translations.ts";

export const prerender = false;

function parseTranslationsFromBody(body: Record<string, unknown>): TaxonomyTranslationInput[] {
  const raw = body.translations;
  if (!Array.isArray(raw)) return [];
  const out: TaxonomyTranslationInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const locale_id = Number(o.locale_id);
    const value = String(o.value ?? "").trim();
    if (!Number.isFinite(locale_id) || locale_id <= 0 || !value) continue;
    out.push({ locale_id, value });
  }
  return out;
}

function parseTranslationsFromFormData(formData: FormData): TaxonomyTranslationInput[] {
  const localeIds = formData.getAll("translation_locale_id[]");
  const values = formData.getAll("translation_value[]");
  const out: TaxonomyTranslationInput[] = [];
  const len = Math.max(localeIds.length, values.length);
  for (let i = 0; i < len; i++) {
    const locale_id = parseInt(String(localeIds[i] ?? ""), 10);
    const value = String(values[i] ?? "").trim();
    if (!Number.isNaN(locale_id) && locale_id > 0 && value) {
      out.push({ locale_id, value });
    }
  }
  return out;
}

export const GET: APIRoute = async ({ request, locals, url }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  try {
    const adminLocale = url.searchParams.get("locale") ?? "pt-br";
    const items = await listTaxonomyTypes(db, adminLocale);
    return jsonResponse({ items });
  } catch (err) {
    console.error("GET /api/taxonomy-types", err);
    return internalServerErrorResponse();
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  try {
    const contentType = request.headers.get("Content-Type") ?? "";
    let keyTitle = "";
    let translations: TaxonomyTranslationInput[] = [];

    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      keyTitle = String(body.key ?? body.name ?? "").trim();
      translations = parseTranslationsFromBody(body);
    } else {
      const formData = await request.formData();
      keyTitle = String(formData.get("key") ?? formData.get("name") ?? "").trim();
      translations = parseTranslationsFromFormData(formData);
    }

    if (!keyTitle) {
      return badRequestResponse("Nome da categoria é obrigatório");
    }

    const created = await createTaxonomyType(db, { name: keyTitle, translations });

    await invalidateContentListByTable(locals, "taxonomies");
    await invalidateTaxonomyCache(locals);
    await invalidateI18nCache(locals);
    invalidateTranslationsCache();

    return new Response(
      JSON.stringify({ success: true, item: created }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "HX-Trigger": JSON.stringify({
            "taxonomy-type-added": created,
          }),
          "Access-Control-Expose-Headers": "HX-Trigger",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "SLUG_EXISTS") {
      return badRequestResponse("Este slug de taxonomia já existe.");
    }
    if (message === "BUILTIN_RESERVED") {
      return badRequestResponse("Este nome está reservado para taxonomias padrão.");
    }
    if (message === "NAME_REQUIRED" || message === "INVALID_SLUG") {
      return badRequestResponse("Nome inválido.");
    }
    console.error("POST /api/taxonomy-types", err);
    return internalServerErrorResponse();
  }
};
