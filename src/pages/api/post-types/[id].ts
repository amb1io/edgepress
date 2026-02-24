/**
 * API for a post type by ID.
 * GET: returns one. PUT: updates. DELETE: removes. Requires admin (role 0).
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
  notFoundResponse,
} from "../../../lib/utils/http-responses.ts";
import type { MetaSchemaItem } from "../../../db/schema/meta_schema.ts";
import { normalizeLineMdIcon } from "../../../lib/line-md-icons.ts";
import { upsertPostTypeTranslations } from "../../../lib/post-type-translations.ts";
import {
  invalidateContentListByTable,
  invalidateI18nCache,
} from "../../../lib/kv-cache-sync.ts";
import { invalidateTranslationsCache } from "../../../i18n/translations.ts";

export const prerender = false;

function parseId(idRaw: string | undefined): number | null {
  if (!idRaw) return null;
  const id = parseInt(idRaw, 10);
  return Number.isNaN(id) ? null : id;
}

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
  if (typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === "object" &&
        parsed !== null &&
        !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const id = parseId(params?.id);
  if (id === null) return badRequestResponse("Bad Request");

  const [row] = await db
    .select({
      id: postTypes.id,
      slug: postTypes.slug,
      name: postTypes.name,
      meta_schema: postTypes.meta_schema,
      created_at: postTypes.created_at,
      updated_at: postTypes.updated_at,
    })
    .from(postTypes)
    .where(eq(postTypes.id, id))
    .limit(1);

  if (!row) return notFoundResponse("Not Found");
  return jsonResponse(row);
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const id = parseId(params?.id);
  if (id === null) return badRequestResponse("Bad Request");

  const [existing] = await db
    .select({ id: postTypes.id })
    .from(postTypes)
    .where(eq(postTypes.id, id))
    .limit(1);

  if (!existing) return notFoundResponse("Not Found");

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
      const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      slug = String(body?.slug ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
      name = String(body?.name ?? "").trim();
      meta_schema = parseMetaSchema(body?.meta_schema);
      meta_values = parseMetaValues(body?.meta_values);
      translationPtBr = String(body?.translation_pt_BR ?? "").trim();
      translationEsEs = String(body?.translation_es_ES ?? "").trim();
      translationEnUs = String(body?.translation_en_US ?? "").trim();
    } else {
      const formData = await request.formData();
      slug = (getString(formData, "slug") ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
      name = getString(formData, "name") ?? "";
      meta_schema = parseMetaSchema(formData.get("meta_schema"));
      meta_values = parseMetaValues(formData.get("meta_values"));
      translationPtBr = (getString(formData, "translation_pt_BR") ?? "").trim();
      translationEsEs = (getString(formData, "translation_es_ES") ?? "").trim();
      translationEnUs = (getString(formData, "translation_en_US") ?? "").trim();
    }
    if (typeof meta_values["icon"] !== "undefined") {
      meta_values = {
        ...meta_values,
        icon: normalizeLineMdIcon(meta_values["icon"]),
      };
    }

    if (!slug || !name) {
      return badRequestResponse("Slug and name are required");
    }

    const now = Date.now();
    await db
      .update(postTypes)
      .set({ slug, name, meta_schema, updated_at: now })
      .where(eq(postTypes.id, id));

    const [existingMenuPost] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.post_type_id, id), like(posts.slug, "menu-%")))
      .limit(1);

    if (Object.keys(meta_values).length > 0) {
      if (existingMenuPost) {
        await db
          .update(posts)
          .set({ meta_values: JSON.stringify(meta_values), updated_at: now })
          .where(eq(posts.id, existingMenuPost.id));
      } else {
        await db.insert(posts).values({
          post_type_id: id,
          title: slug,
          slug: `menu-${slug}-${now}`,
          status: "published",
          meta_values: JSON.stringify(meta_values),
          created_at: now,
          updated_at: now,
        });
      }
    } else if (existingMenuPost) {
      await db
        .update(posts)
        .set({ meta_values: "{}", updated_at: now })
        .where(eq(posts.id, existingMenuPost.id));
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
    console.error("PUT /api/post-types/[id]", err);
    return internalServerErrorResponse();
  }
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const id = parseId(params?.id);
  if (id === null) return badRequestResponse("Bad Request");

  const [existing] = await db
    .select({ id: postTypes.id })
    .from(postTypes)
    .where(eq(postTypes.id, id))
    .limit(1);

  if (!existing) return notFoundResponse("Not Found");

  // Mark as trash and then remove the posts (post_type_id is NOT NULL in the database)
  await db
    .update(posts)
    .set({ status: "trash" as typeof posts.$inferSelect.status })
    .where(eq(posts.post_type_id, id));

  await db.delete(posts).where(eq(posts.post_type_id, id));
  await db.delete(postTypes).where(eq(postTypes.id, id));
  await invalidateContentListByTable(locals, "post_types");
  return htmxRefreshResponse();
};
