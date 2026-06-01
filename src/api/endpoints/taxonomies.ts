import { db } from "../../db/index.ts";
import { taxonomies, locales } from "../../db/schema.ts";
import { eq, inArray } from "drizzle-orm";
import { slugify } from "../../utils/slugify.ts";
import { requireMinRole } from "../../utils/api-auth.ts";
import { getString, getNumber } from "../../utils/form-data.ts";
import { errorHtmlResponse, jsonResponse } from "../../utils/http-responses.ts";
import { invalidateContentListByTable, invalidateI18nCache } from "../../utils/kv-cache-sync.ts";
import { invalidateTranslationsCache } from "../../i18n/translations.ts";
import { upsertNamespaceTranslationRows } from "../../utils/translation-upsert.ts";
import { TAXONOMY_TYPE_I18N_NAMESPACE } from "../../core/services/taxonomy-type-registry.ts";

export const prerender = false;

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
    const translationRows = await parseTaxonomyTranslationRows(formData);
    if (translationRows.length > 0) {
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
