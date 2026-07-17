import { db } from "../../db/index.ts";
import { taxonomies } from "../../db/schema.ts";
import { eq } from "drizzle-orm";
import { slugify } from "../../utils/slugify.ts";
import { requireMinRole } from "../../utils/api-auth.ts";
import { getString, getNumber } from "../../utils/form-data.ts";
import { errorHtmlResponse, jsonResponse } from "../../utils/http-responses.ts";
import { invalidateContentListByTable, invalidateI18nCache, invalidateTaxonomyCache, invalidateThemeContentCache } from "../../utils/kv-cache-sync.ts";
import { invalidateTranslationsCache } from "../../i18n/translations.ts";
import { persistTaxonomyTermTranslations } from "../../utils/taxonomy-translation-persist.ts";
import { parseTaxonomySlugTranslationRows } from "../../utils/taxonomy-translation-form.ts";
import { validateTaxonomySlugTranslations } from "../../core/services/taxonomy-translation-service.ts";

export const prerender = false;

export async function POST({
  request,
  locals,
}: {
  request: Request;
  locals: App.Locals;
}): Promise<Response> {
  const authResult = await requireMinRole(request, 1, locals);
  if (authResult instanceof Response) return authResult;

  try {
    const formData = await request.formData();
    const name = getString(formData, "name");
    const slugInput = getString(formData, "slug");
    const descriptionRaw = getString(formData, "description");
    const description = descriptionRaw === "" ? null : descriptionRaw;
    const parent_id = getNumber(formData, "parent_id", null);
    const type = getString(formData, "type");
    const locale = getString(formData, "locale", "pt-br");

    if (!name || !type) {
      return errorHtmlResponse(locale);
    }

    const slug = slugInput ? slugify(slugInput) : slugify(name);
    if (!slug) {
      return errorHtmlResponse(locale);
    }

    const now = Date.now();

    const existing = await db
      .select({ id: taxonomies.id })
      .from(taxonomies)
      .where(eq(taxonomies.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      return errorHtmlResponse(locale);
    }

    const slugRows = await parseTaxonomySlugTranslationRows(db, formData);
    const slugConflict = await validateTaxonomySlugTranslations(db, type, slugRows, null);
    if (slugConflict) {
      return errorHtmlResponse(locale);
    }

    const [inserted] = await db
      .insert(taxonomies)
      .values({
        name,
        slug,
        description,
        type,
        parent_id,
        id_locale_code: null,
        created_at: now,
        updated_at: now,
      })
      .returning({
        id: taxonomies.id,
        name: taxonomies.name,
        slug: taxonomies.slug,
      });

    if (!inserted) {
      return errorHtmlResponse(locale);
    }

    await invalidateContentListByTable(locals, "taxonomies");
    await persistTaxonomyTermTranslations(db, formData, type, slug);
    await invalidateTaxonomyCache(locals);
    await invalidateThemeContentCache(locals);
    await invalidateI18nCache(locals);
    invalidateTranslationsCache();

    const language = "—";

    let parent_name = "—";
    if (parent_id != null) {
      const [parentRow] = await db
        .select({ name: taxonomies.name, parent_id: taxonomies.parent_id })
        .from(taxonomies)
        .where(eq(taxonomies.id, parent_id))
        .limit(1);
      if (parentRow?.name && parentRow.parent_id != null) {
        parent_name = parentRow.name;
      }
    }

    const triggerPayload = {
      "taxonomy-added": {
        id: inserted.id,
        name: inserted.name,
        slug: inserted.slug,
        type,
        language,
        parent_id,
        parent_name,
      },
    };
    return jsonResponse(
      { success: true, taxonomy: { ...inserted, type, language } },
      200,
      {
        "HX-Trigger": JSON.stringify(triggerPayload),
        "Access-Control-Expose-Headers": "HX-Trigger",
      }
    );
  } catch (err) {
    console.error("POST /api/taxonomies", err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    return errorHtmlResponse("pt-br");
  }
}
