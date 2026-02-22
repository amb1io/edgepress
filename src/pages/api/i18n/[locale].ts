/**
 * GET /api/i18n/[locale]
 * Retorna traduções do banco (DB) com fallback dos arquivos JSON.
 * Ordem: DB sobrescreve JSON; chaves só nos JSON permanecem.
 */
import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { translations as translationsTable, translationsLanguages as translationsLanguagesTable, locales as localesTable } from "../../../db/schema.ts";
import { eq } from "drizzle-orm";
import { getCacheKvFromLocals } from "../../../lib/utils/runtime-locals.ts";
import enFallback from "../../../i18n/languages/en.json";
import esFallback from "../../../i18n/languages/es.json";
import ptBrFallback from "../../../i18n/languages/pt_br.json";

export const prerender = false;

const FALLBACK_BY_LOCALE: Record<string, Record<string, string>> = {
  en: enFallback as Record<string, string>,
  es: esFallback as Record<string, string>,
  "pt-br": ptBrFallback as Record<string, string>,
  en_US: enFallback as Record<string, string>,
  es_ES: esFallback as Record<string, string>,
  pt_BR: ptBrFallback as Record<string, string>,
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

function getFallbackForParam(localeParam: string): Record<string, string> {
  const key = localeParam.toLowerCase().replace(/-/g, "_");
  return FALLBACK_BY_LOCALE[key] ?? FALLBACK_BY_LOCALE.en ?? {};
}

export const GET: APIRoute = async ({ params, locals }) => {
  const localeParam = params.locale;
  if (!localeParam) {
    return new Response(
      JSON.stringify({ error: "locale_required", message: "Locale parameter is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const kv = getCacheKvFromLocals(locals);
  const dbLocaleCode = normalizeLocaleForDB(localeParam);
  const cacheKey = `i18n:${dbLocaleCode}`;

  const fallback = getFallbackForParam(localeParam);

  // Autenticado: bypass KV e vai direto ao DB. Não autenticado: tenta KV primeiro.
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
      return new Response(JSON.stringify(fallback), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
        },
      });
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

    // DB sobrescreve fallback; chaves só nos JSON permanecem
    const merged = { ...fallback, ...translationsMap };

    if (kv) {
      try {
        await kv.put(cacheKey, JSON.stringify(merged));
      } catch {
        // Não falha a resposta se o KV não aceitar o put
      }
    }

    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Error fetching translations:", error);
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
      },
    });
  }
};
