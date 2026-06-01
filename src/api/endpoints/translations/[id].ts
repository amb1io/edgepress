import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { translations as translationsTable, translationsLanguages as translationsLanguagesTable } from "../../../db/schema.ts";
import { and, eq } from "drizzle-orm";
import { requireMinRole } from "../../../utils/api-auth.ts";
import { badRequestResponse, htmxRefreshResponse, notFoundResponse } from "../../../utils/http-responses.ts";
import { invalidateI18nCache } from "../../../utils/kv-cache-sync.ts";
import { invalidateTranslationsCache } from "../../../i18n/translations.ts";

export const prerender = false;

function parseId(idRaw: string | undefined): number | null {
  if (!idRaw) return null;
  const id = parseInt(idRaw, 10);
  return Number.isNaN(id) ? null : id;
}

/**
 * DELETE /api/translations/[id]
 *
 * Aceita:
 * - id de `translations_languages` (deleta só a linha desse locale)
 * - id de `translations` (deleta a tradução inteira + todas as linhas em translations_languages)
 */
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const id = parseId(params?.id);
  if (id === null) return badRequestResponse("Bad Request");

  // 1) Se for id de translations_languages, deletar só essa linha
  const [langRow] = await db
    .select({ id_translations: translationsLanguagesTable.id_translations })
    .from(translationsLanguagesTable)
    .where(eq(translationsLanguagesTable.id, id))
    .limit(1);

  if (langRow) {
    await db.delete(translationsLanguagesTable).where(eq(translationsLanguagesTable.id, id));

    // Se ficou sem nenhum locale, apagar a chave base também
    const remaining = await db
      .select({ id: translationsLanguagesTable.id })
      .from(translationsLanguagesTable)
      .where(eq(translationsLanguagesTable.id_translations, langRow.id_translations))
      .limit(1);
    if (remaining.length === 0) {
      await db.delete(translationsTable).where(eq(translationsTable.id, langRow.id_translations));
    }

    await invalidateI18nCache(locals);
    invalidateTranslationsCache();

    if (request.headers.get("HX-Request") === "true") return htmxRefreshResponse();
    return new Response(JSON.stringify({ success: true, id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2) Senão, tratar como id de translations: deletar tudo em cascade manual
  const [baseRow] = await db
    .select({ id: translationsTable.id })
    .from(translationsTable)
    .where(eq(translationsTable.id, id))
    .limit(1);

  if (!baseRow) {
    // DELETE idempotente: se o registro já não existe (ex.: double click / list desatualizada),
    // preferimos retornar sucesso para não travar a UI.
    if (request.headers.get("HX-Request") === "true") return htmxRefreshResponse();
    return new Response(JSON.stringify({ success: true, id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db.delete(translationsLanguagesTable).where(eq(translationsLanguagesTable.id_translations, id));
  await db.delete(translationsTable).where(eq(translationsTable.id, id));

  await invalidateI18nCache(locals);
  invalidateTranslationsCache();

  if (request.headers.get("HX-Request") === "true") return htmxRefreshResponse();
  return new Response(JSON.stringify({ success: true, id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

