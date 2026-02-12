/**
 * GET /api/i18n/[locale]
 * Retorna todas as traduções para um locale específico da tabela translations_languages
 * Com cache em KV
 */
import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { translations as translationsTable, translationsLanguages as translationsLanguagesTable, locales as localesTable } from "../../../db/schema.ts";
import { eq } from "drizzle-orm";

export const prerender = false;

type KVLike = {
  get(key: string, type?: "text" | "json"): Promise<string | unknown | null>;
  put(key: string, value: string): Promise<void>;
};

// Mapeamento de locales para locale_code da tabela
const LOCALE_MAP: Record<string, string> = {
  en: "en_US",
  "en-US": "en_US",
  "en_US": "en_US",
  es: "es_ES",
  "es-ES": "es_ES",
  "es_ES": "es_ES",
  "pt-br": "pt_BR",
  "pt_BR": "pt_BR",
  "pt-BR": "pt_BR",
};

function normalizeLocaleForDB(locale: string): string {
  const normalized = locale.toLowerCase().replace(/-/g, "_");
  return LOCALE_MAP[normalized] || LOCALE_MAP[locale] || locale;
}

export const GET: APIRoute = async ({ params, locals }) => {
  const localeParam = params.locale;
  if (!localeParam) {
    return new Response(
      JSON.stringify({ error: "locale_required", message: "Locale parameter is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const kv = (locals as { runtime?: { env?: { edgepress_cache?: KVLike | null } } }).runtime?.env?.edgepress_cache ?? null;
  const dbLocaleCode = normalizeLocaleForDB(localeParam);
  const cacheKey = `i18n:${dbLocaleCode}`;

  // Tentar buscar do cache primeiro
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, "json") as Record<string, string> | null;
      if (cached && typeof cached === "object") {
        return new Response(JSON.stringify(cached), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
    } catch {
      // Ignora erro de KV e segue para o banco
    }
  }

  try {
    // Buscar o ID do locale
    const [localeRow] = await db
      .select({ id: localesTable.id })
      .from(localesTable)
      .where(eq(localesTable.locale_code, dbLocaleCode))
      .limit(1);

    if (!localeRow) {
      return new Response(
        JSON.stringify({ error: "locale_not_found", message: `Locale ${dbLocaleCode} not found` }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Buscar todas as traduções para este locale
    const translationsData = await db
      .select({
        namespace: translationsTable.namespace,
        key: translationsTable.key,
        value: translationsLanguagesTable.value,
      })
      .from(translationsLanguagesTable)
      .innerJoin(translationsTable, eq(translationsLanguagesTable.id_translations, translationsTable.id))
      .where(eq(translationsLanguagesTable.id_locale_code, localeRow.id));

    // Transformar em formato de objeto chave-valor (namespace.key -> value)
    const translationsMap: Record<string, string> = {};
    for (const row of translationsData) {
      const fullKey = row.namespace ? `${row.namespace}.${row.key}` : row.key;
      translationsMap[fullKey] = row.value;
    }

    // Salvar no cache
    if (kv && Object.keys(translationsMap).length > 0) {
      try {
        await kv.put(cacheKey, JSON.stringify(translationsMap));
      } catch {
        // Não falha a resposta se o KV não aceitar o put
      }
    }

    return new Response(JSON.stringify(translationsMap), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error fetching translations:", error);
    return new Response(
      JSON.stringify({ error: "internal_error", message: "Failed to fetch translations" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
