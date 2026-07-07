import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { taxonomies, postsTaxonomies } from "../../../db/schema.ts";
import { eq, and, ne, inArray } from "drizzle-orm";
import { slugify } from "../../../utils/slugify.ts";
import { requireMinRole } from "../../../utils/api-auth.ts";
import { getString, getNumber } from "../../../utils/form-data.ts";
import {
  badRequestResponse,
  errorResponse,
  htmlResponse,
  internalServerErrorResponse,
  jsonResponse,
} from "../../../utils/http-responses.ts";
import { HTTP_STATUS_CODES } from "../../../shared/constants/index.ts";
import { invalidateContentListByTable, invalidateI18nCache, invalidateRelatedPostsCache } from "../../../utils/kv-cache-sync.ts";
import { invalidateTranslationsCache } from "../../../i18n/translations.ts";
import { removeTaxonomyTypeTranslationNamespaces } from "../../../core/services/taxonomy-type-registry.ts";
import {
  deleteTaxonomyTermTranslations,
  migrateTaxonomyTermTranslationKeys,
  persistTaxonomyTermTranslations,
} from "../../../utils/taxonomy-translation-persist.ts";
import { reindexPostsByTaxonomyId } from "../../../core/services/search-service.ts";

export const prerender = false;

async function collectTaxonomyCascadeIds(rootId: number): Promise<number[]> {
  const ids: number[] = [rootId];
  const seen = new Set<number>([rootId]);

  for (let i = 0; i < ids.length; i += 1) {
    const parentId = ids[i];
    if (parentId == null) continue;
    const children = await db
      .select({ id: taxonomies.id })
      .from(taxonomies)
      .where(eq(taxonomies.parent_id, parentId));

    for (const child of children) {
      if (!seen.has(child.id)) {
        seen.add(child.id);
        ids.push(child.id);
      }
    }
  }

  return ids;
}

async function handleTaxonomyUpdate(
  termId: number,
  request: Request,
  locals: App.Locals,
): Promise<Response> {
  try {
    const formData = await request.formData();
    const name = getString(formData, "name");
    const slugInput = getString(formData, "slug");
    const descriptionRaw = getString(formData, "description");
    const description = descriptionRaw === "" ? null : descriptionRaw;
    const type = getString(formData, "type");
    const parent_id = getNumber(formData, "parent_id", null);
    if (!name || !type) {
      return badRequestResponse("Bad Request");
    }
    const slug = slugInput ? slugify(slugInput) : slugify(name);
    if (!slug) {
      return badRequestResponse("Bad Request");
    }

    const [current] = await db
      .select({ slug: taxonomies.slug })
      .from(taxonomies)
      .where(eq(taxonomies.id, termId))
      .limit(1);
    const previousSlug = current?.slug ?? null;

    const existing = await db
      .select({ id: taxonomies.id })
      .from(taxonomies)
      .where(and(eq(taxonomies.slug, slug), ne(taxonomies.id, termId)))
      .limit(1);
    if (existing.length > 0) {
      return errorResponse("Conflict", HTTP_STATUS_CODES.CONFLICT);
    }

    const translationResult = await persistTaxonomyTermTranslations(
      db,
      formData,
      type,
      slug,
      previousSlug,
    );
    if (!translationResult.ok) {
      return errorResponse("Conflict", HTTP_STATUS_CODES.CONFLICT);
    }

    const now = Date.now();
    await db
      .update(taxonomies)
      .set({
        name,
        slug,
        description,
        type,
        parent_id,
        updated_at: now,
      })
      .where(eq(taxonomies.id, termId));

    if (previousSlug && previousSlug !== slug) {
      await migrateTaxonomyTermTranslationKeys(db, previousSlug, slug);
    }

    await reindexPostsByTaxonomyId(db, termId);

    await invalidateContentListByTable(locals, "taxonomies");
    await invalidateRelatedPostsCache(locals);
    await invalidateI18nCache(locals);
    invalidateTranslationsCache();

    const language = "—";

    let parent_name = "—";
    if (parent_id != null) {
      const [parentRow] = await db
        .select({ name: taxonomies.name })
        .from(taxonomies)
        .where(eq(taxonomies.id, parent_id))
        .limit(1);
      if (parentRow?.name) parent_name = parentRow.name;
    }

    return jsonResponse(
      { success: true },
      200,
      {
        "HX-Trigger": JSON.stringify({
          "taxonomy-updated": { id: termId, name, slug, type, language, parent_name },
        }),
      }
    );
  } catch (err) {
    console.error("PUT/POST /api/taxonomies/[id]", err);
    return internalServerErrorResponse();
  }
}

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 1, locals);
  if (authResult instanceof Response) return authResult;

  const id = params?.id;
  if (!id || !/^\d+$/.test(id)) {
    return badRequestResponse("Bad Request");
  }
  return handleTaxonomyUpdate(parseInt(id, 10), request, locals);
};

/** POST no mesmo path é aceito como fallback quando o form é enviado como POST (ex.: HTMX não intercepta). */
export const POST: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 1, locals);
  if (authResult instanceof Response) return authResult;

  const id = params?.id;
  if (!id || !/^\d+$/.test(id)) {
    return badRequestResponse("Bad Request");
  }
  return handleTaxonomyUpdate(parseInt(id, 10), request, locals);
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 1, locals);
  if (authResult instanceof Response) return authResult;

  const id = params?.id;
  if (!id || !/^\d+$/.test(id)) {
    return badRequestResponse("Bad Request");
  }
  const termId = parseInt(id, 10);
  try {
    const [target] = await db
      .select({
        type: taxonomies.type,
        slug: taxonomies.slug,
        parent_id: taxonomies.parent_id,
      })
      .from(taxonomies)
      .where(eq(taxonomies.id, termId))
      .limit(1);
    const targetType = target?.type ?? null;
    const targetSlug = target?.slug ?? null;
    const isRootTerm = target?.parent_id == null;

    const idsToDelete = await collectTaxonomyCascadeIds(termId);

    const slugsToDelete = await db
      .select({ slug: taxonomies.slug })
      .from(taxonomies)
      .where(inArray(taxonomies.id, idsToDelete));

    await db.delete(postsTaxonomies).where(inArray(postsTaxonomies.term_id, idsToDelete));
    await db.delete(taxonomies).where(inArray(taxonomies.id, idsToDelete));

    for (const row of slugsToDelete) {
      if (row.slug) {
        await deleteTaxonomyTermTranslations(db, row.slug);
      }
    }

    if (isRootTerm && targetType) {
      const [remaining] = await db
        .select({ id: taxonomies.id })
        .from(taxonomies)
        .where(eq(taxonomies.type, targetType))
        .limit(1);
      if (!remaining) {
        await removeTaxonomyTypeTranslationNamespaces(db, targetType);
      }
    }

    await invalidateContentListByTable(locals, "taxonomies");
    await invalidateRelatedPostsCache(locals);
    await invalidateI18nCache(locals);
    invalidateTranslationsCache();
    return htmlResponse("", 200);
  } catch (err) {
    console.error("DELETE /api/taxonomies/[id]", err);
    return internalServerErrorResponse();
  }
};
