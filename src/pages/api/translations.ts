/**
 * POST /api/translations
 * Creates or updates a translation in the translations and translations_languages tables
 */
import type { APIRoute } from "astro";
import { db } from "../../db/index.ts";
import {
  translations as translationsTable,
  translationsLanguages as translationsLanguagesTable,
} from "../../db/schema.ts";
import { eq, and, not } from "drizzle-orm";
import { requireMinRole } from "../../lib/api-auth.ts";
import { getString, getNumber } from "../../lib/utils/form-data.ts";
import { badRequestResponse, badRequestHtmlResponse, jsonResponse, redirectResponse, htmxRedirectResponse } from "../../lib/utils/http-responses.ts";
import { buildAbsoluteUrl, buildContentUrl, buildListUrl } from "../../lib/utils/url.ts";
import { invalidateI18nCache } from "../../lib/kv-cache-sync.ts";
import { invalidateTranslationsCache } from "../../i18n/translations.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 2, locals);
  if (authResult instanceof Response) return authResult;

  const formData = await request.formData();
  const action = getString(formData, "action");
  const idParam = getString(formData, "id") || null;
  const locale = getString(formData, "locale", "pt-br");
  const namespace = getString(formData, "namespace");
  const key = getString(formData, "key");
  const translationValue = getString(formData, "translation");
  const localeId = getNumber(formData, "locale_id", null);

  const isHtmx = request.headers.get("HX-Request") === "true";

  // Validate required fields
  if (!namespace || !key || !translationValue || localeId === null) {
    if (isHtmx) return badRequestHtmlResponse("Preencha todos os campos obrigatórios.");
    const redirectUrl = buildAbsoluteUrl(
      request,
      buildContentUrl(locale, "translations_languages", action, idParam || undefined)
    );
    return redirectResponse(redirectUrl);
  }

  // Check if a translation with same namespace and key already exists (except when editing the same record)
  const existing = await db
    .select({ id: translationsTable.id })
    .from(translationsTable)
    .where(
      action === "edit" && idParam
        ? and(
            eq(translationsTable.namespace, namespace),
            eq(translationsTable.key, key),
            not(eq(translationsTable.id, parseInt(idParam, 10)))
          )
        : and(
            eq(translationsTable.namespace, namespace),
            eq(translationsTable.key, key)
          )
    )
    .limit(1);

  if (existing.length > 0) {
    if (isHtmx) return badRequestHtmlResponse("A translation with this namespace and key already exists.");
    return badRequestResponse("A translation with this namespace and key already exists");
  }

  const now = Date.now();

  try {
    let translationId: number;

    if (action === "edit" && idParam) {
      // EDIT
      const idParamNum = parseInt(idParam, 10);
      if (isNaN(idParamNum)) {
        if (isHtmx) return badRequestHtmlResponse("ID inválido.");
        return badRequestResponse("ID inválido");
      }

      // Check whether the ID is from translations_languages or translations
      // First, try to look it up in translations_languages
      const [translationLangRow] = await db
        .select({
          id_translations: translationsLanguagesTable.id_translations,
        })
        .from(translationsLanguagesTable)
        .where(eq(translationsLanguagesTable.id, idParamNum))
        .limit(1);

      if (translationLangRow) {
        // If found in translations_languages, use id_translations
        translationId = translationLangRow.id_translations;
      } else {
        // If not found, assume it is the translations ID
        translationId = idParamNum;
      }

      await db
        .update(translationsTable)
        .set({
          namespace,
          key,
          updated_at: now,
        })
        .where(eq(translationsTable.id, translationId));
    } else {
      // CREATE
      const [inserted] = await db
        .insert(translationsTable)
        .values({
          namespace,
          key,
          created_at: now,
          updated_at: now,
        })
        .returning({ id: translationsTable.id });

      translationId = inserted.id;
    }

    // Insert or update in the translations_languages table
    // Check whether a record for this translation and locale already exists
    const existingTranslationLang = await db
      .select({ id: translationsLanguagesTable.id })
      .from(translationsLanguagesTable)
      .where(
        and(
          eq(translationsLanguagesTable.id_translations, translationId),
          eq(translationsLanguagesTable.id_locale_code, localeId)
        )
      )
      .limit(1);

    if (existingTranslationLang.length > 0) {
      // Update existing record
      await db
        .update(translationsLanguagesTable)
        .set({
          value: translationValue,
        })
        .where(eq(translationsLanguagesTable.id, existingTranslationLang[0].id));
    } else {
      // Insert new record
      await db.insert(translationsLanguagesTable).values({
        id_translations: translationId,
        id_locale_code: localeId,
        value: translationValue,
      });
    }

    await invalidateI18nCache(locals);
    invalidateTranslationsCache();

    const acceptsJson = request.headers.get("Accept")?.includes("application/json");
    if (acceptsJson) return jsonResponse({ id: translationId });

    const listUrl = buildAbsoluteUrl(request, buildListUrl(locale, "translations_languages"));
    if (isHtmx) return htmxRedirectResponse(listUrl);
    return redirectResponse(listUrl);
  } catch (error) {
    console.error("Error saving translation:", error);
    if (isHtmx) return badRequestHtmlResponse("Error saving translation.");
    return badRequestResponse("Error saving translation");
  }
};
