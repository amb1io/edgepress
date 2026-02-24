/**
 * Post types API.
 * GET: lists all. POST: creates a new one. Requires admin (role 0).
 */
import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { postTypes, posts } from "../../../db/schema.ts";
import { and, eq, like } from "drizzle-orm";
import { requireMinRole } from "../../../lib/api-auth.ts";
import { getString } from "../../../lib/utils/form-data.ts";
import {
  badRequestResponse,
  htmxRefreshResponse,
  internalServerErrorResponse,
  jsonResponse,
} from "../../../lib/utils/http-responses.ts";
import type { MetaSchemaItem } from "../../../db/schema/meta_schema.ts";
import { normalizeLineMdIcon } from "../../../lib/line-md-icons.ts";
import { upsertPostTypeTranslations } from "../../../lib/post-type-translations.ts";
import { invalidateContentListByTable, invalidateI18nCache } from "../../../lib/kv-cache-sync.ts";
import { invalidateTranslationsCache } from "../../../i18n/translations.ts";

export const prerender = false;

function parseMetaSchema(value: unknown): MetaSchemaItem[] {
  if (Array.isArray(value)) return value as MetaSchemaItem[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as MetaSchemaItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseMetaValues(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

export const GET: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  try {
    const rows = await db
      .select({
        id: postTypes.id,
        slug: postTypes.slug,
        name: postTypes.name,
        meta_schema: postTypes.meta_schema,
        created_at: postTypes.created_at,
        updated_at: postTypes.updated_at,
      })
      .from(postTypes)
      .orderBy(postTypes.slug);

    return jsonResponse({ items: rows });
  } catch (err) {
    console.error("GET /api/post-types", err);
    return internalServerErrorResponse();
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  try {
    const contentType = request.headers.get("Content-Type") ?? "";
    let slug: string;
    let name: string;
    let meta_schema: MetaSchemaItem[];
    let meta_values: Record<string, unknown>;
    let translationPtBr = "";
    let translationEsEs = "";
    let translationEnUs = "";

    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      slug = String(body?.slug ?? "").trim().toLowerCase().replace(/\s+/g, "_");
      name = String(body?.name ?? "").trim();
      meta_schema = parseMetaSchema(body?.meta_schema);
      meta_values = parseMetaValues(body?.meta_values);
      translationPtBr = String(body?.translation_pt_BR ?? "").trim();
      translationEsEs = String(body?.translation_es_ES ?? "").trim();
      translationEnUs = String(body?.translation_en_US ?? "").trim();
    } else {
      const formData = await request.formData();
      slug = (getString(formData, "slug") ?? "").trim().toLowerCase().replace(/\s+/g, "_");
      name = getString(formData, "name") ?? "";
      meta_schema = parseMetaSchema(formData.get("meta_schema"));
      meta_values = parseMetaValues(formData.get("meta_values"));
      translationPtBr = (getString(formData, "translation_pt_BR") ?? "").trim();
      translationEsEs = (getString(formData, "translation_es_ES") ?? "").trim();
      translationEnUs = (getString(formData, "translation_en_US") ?? "").trim();
    }
    if (typeof meta_values["icon"] !== "undefined") {
      meta_values = { ...meta_values, icon: normalizeLineMdIcon(meta_values["icon"]) };
    }

    if (!slug || !name) {
      return badRequestResponse("Slug e nome são obrigatórios");
    }

    const [existing] = await db
      .select({ id: postTypes.id })
      .from(postTypes)
      .where(eq(postTypes.slug, slug))
      .limit(1);
    if (existing) {
      return badRequestResponse("Este slug já está em uso. Escolha outro.");
    }

    const now = Date.now();
    const [inserted] = await db
      .insert(postTypes)
      .values({
        slug,
        name,
        meta_schema,
        created_at: now,
        updated_at: now,
      })
      .returning({ id: postTypes.id });
    const typeId = inserted?.id;
    if (typeId != null && Object.keys(meta_values).length > 0) {
      const menuSlug = `menu-${slug}-${now}`;
      await db.insert(posts).values({
        post_type_id: typeId,
        title: slug,
        slug: menuSlug,
        status: "published",
        meta_values: JSON.stringify(meta_values),
        created_at: now,
        updated_at: now,
      });
    }

    await upsertPostTypeTranslations(db, slug, {
      pt_BR: translationPtBr,
      es_ES: translationEsEs,
      en_US: translationEnUs,
    });

    await invalidateContentListByTable(locals, "post_types");
    await invalidateI18nCache(locals);
    invalidateTranslationsCache();
    return htmxRefreshResponse();
  } catch (err) {
    console.error("POST /api/post-types", err);
    return internalServerErrorResponse();
  }
};
