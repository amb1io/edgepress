import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { taxonomies, postsTaxonomies, locales, translations, translationsLanguages } from "../../../db/schema.ts";
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
import {
  removeTaxonomyTypeTranslationNamespaces,
  TAXONOMY_TYPE_I18N_NAMESPACE,
} from "../../../core/services/taxonomy-type-registry.ts";
import { upsertNamespaceTranslationRows } from "../../../utils/translation-upsert.ts";
import { reindexPostsByTaxonomyId } from "../../../core/services/search-service.ts";

export const prerender = false;

async function deleteTaxonomyTypeTranslationByKey(dbKey: string): Promise<void> {
  const [translationRow] = await db
    .select({ id: translations.id })
    .from(translations)
    .where(
      and(eq(translations.namespace, TAXONOMY_TYPE_I18N_NAMESPACE), eq(translations.key, dbKey)),
    )
    .limit(1);
  if (!translationRow) return;
  await db
    .delete(translationsLanguages)
    .where(eq(translationsLanguages.id_translations, translationRow.id));
  await db.delete(translations).where(eq(translations.id, translationRow.id));
}

async function parseTaxonomyTranslationRows(formData: FormData) {
  const byLocaleCode = new Map<string, string>();
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith("translation_")) continue;
    const localeCode = key.slice("translation_".length).trim();
    if (!localeCode) continue;
    const value = String(raw ?? "").trim();
    if (!value) continue;
    byLocaleCode.set(localeCode, value);
  }
  if (byLocaleCode.size === 0) return [];

  const localeCodes = [...byLocaleCode.keys()];
  const localeRows = await db
    .select({ id: locales.id, locale_code: locales.locale_code })
    .from(locales)
    .where(inArray(locales.locale_code, localeCodes));

  return localeRows
    .map((row) => ({
      locale_id: row.id,
      value: byLocaleCode.get(row.locale_code) ?? "",
    }))
    .filter((row) => row.locale_id && row.value);
}

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

    await reindexPostsByTaxonomyId(db, termId);

    await invalidateContentListByTable(locals, "taxonomies");
    await invalidateRelatedPostsCache(locals);
    const translationRows = await parseTaxonomyTranslationRows(formData);
    if (translationRows.length > 0) {
      if (previousSlug && previousSlug !== slug) {
        await deleteTaxonomyTypeTranslationByKey(previousSlug);
      }
      await upsertNamespaceTranslationRows(
        db,
        TAXONOMY_TYPE_I18N_NAMESPACE,
        slug,
        translationRows,
      );
      await invalidateI18nCache(locals);
      invalidateTranslationsCache();
    }

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
    await db.delete(postsTaxonomies).where(inArray(postsTaxonomies.term_id, idsToDelete));
    await db.delete(taxonomies).where(inArray(taxonomies.id, idsToDelete));

    if (isRootTerm && targetSlug) {
      await deleteTaxonomyTypeTranslationByKey(targetSlug);
    }

    if (targetType) {
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
