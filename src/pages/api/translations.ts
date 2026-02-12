/**
 * POST /api/translations
 * Cria ou atualiza uma tradução na tabela translations e translations_languages
 */
import type { APIRoute } from "astro";
import { db } from "../../db/index.ts";
import {
  translations as translationsTable,
  translationsLanguages as translationsLanguagesTable,
} from "../../db/schema.ts";
import { eq, and, not } from "drizzle-orm";
import { requireMinRole } from "../../lib/api-auth.ts";
import { badRequestResponse, jsonResponse, redirectResponse } from "../../lib/utils/http-responses.ts";
import { buildAbsoluteUrl, buildContentUrl, buildListUrl } from "../../lib/utils/url.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 2, locals);
  if (authResult instanceof Response) return authResult;

  const formData = await request.formData();
  const action = formData.get("action")?.toString() || "";
  const idParam = formData.get("id")?.toString() || null;
  const locale = formData.get("locale")?.toString() || "pt-br";
  const namespace = formData.get("namespace")?.toString()?.trim() || "";
  const key = formData.get("key")?.toString()?.trim() || "";
  const translationValue = formData.get("translation")?.toString()?.trim() || "";
  const localeIdParam = formData.get("locale_id")?.toString() || null;

  // Validar campos obrigatórios
  if (!namespace || !key || !translationValue || !localeIdParam) {
    const redirectUrl = buildAbsoluteUrl(
      request,
      buildContentUrl(locale, "translations_languages", action, idParam || undefined)
    );
    return redirectResponse(redirectUrl);
  }

  const localeId = parseInt(localeIdParam, 10);
  if (isNaN(localeId)) {
    return badRequestResponse("ID do idioma inválido");
  }

  // Verificar se já existe uma tradução com mesmo namespace e key (exceto na edição do mesmo registro)
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
    return badRequestResponse("Já existe uma tradução com este namespace e key");
  }

  const now = Date.now();

  try {
    let translationId: number;

    if (action === "edit" && idParam) {
      // EDIÇÃO
      const idParamNum = parseInt(idParam, 10);
      if (isNaN(idParamNum)) {
        return badRequestResponse("ID inválido");
      }

      // Verificar se o ID é de translations_languages ou translations
      // Primeiro, tentar buscar em translations_languages
      const [translationLangRow] = await db
        .select({
          id_translations: translationsLanguagesTable.id_translations,
        })
        .from(translationsLanguagesTable)
        .where(eq(translationsLanguagesTable.id, idParamNum))
        .limit(1);

      if (translationLangRow) {
        // Se encontrou em translations_languages, usar o id_translations
        translationId = translationLangRow.id_translations;
      } else {
        // Se não encontrou, assumir que é o ID de translations
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
      // CRIAÇÃO
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

    // Inserir ou atualizar na tabela translations_languages
    // Verificar se já existe um registro para esta tradução e locale
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
      // Atualizar registro existente
      await db
        .update(translationsLanguagesTable)
        .set({
          value: translationValue,
        })
        .where(eq(translationsLanguagesTable.id, existingTranslationLang[0].id));
    } else {
      // Inserir novo registro
      await db.insert(translationsLanguagesTable).values({
        id_translations: translationId,
        id_locale_code: localeId,
        value: translationValue,
      });
    }

    const acceptsJson = request.headers.get("Accept")?.includes("application/json");
    if (acceptsJson) {
      return jsonResponse({ id: translationId });
    }

    const listUrl = buildAbsoluteUrl(request, buildListUrl(locale, "translations_languages"));
    return redirectResponse(listUrl);
  } catch (error) {
    console.error("Error saving translation:", error);
    return badRequestResponse("Erro ao salvar tradução");
  }
};
