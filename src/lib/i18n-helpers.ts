/**
 * Helper para pré-carregar traduções em páginas Astro
 */
import { preloadTranslations } from "../i18n/index.ts";
import { db } from "../db/index.ts";
import { locales as localesTable, translations as translationsTable, translationsLanguages as translationsLanguagesTable } from "../db/schema.ts";
import { eq } from "drizzle-orm";

/**
 * Pré-carrega traduções para um locale específico usando o banco de dados
 * Use esta função no início das páginas Astro antes de usar t()
 */
export async function ensureTranslationsLoaded(locale: string): Promise<void> {
  await preloadTranslations(locale, {
    db,
    localesTable,
    translationsTable,
    translationsLanguagesTable,
    eq,
  });
}
