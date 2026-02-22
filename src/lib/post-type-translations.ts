/**
 * Upsert traduções do nome do post type na tabela translations (namespace postType, key = slug).
 * Cria ou atualiza o registro em translations e em translations_languages para pt_BR, es_ES, en_US.
 */
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { and, eq, inArray } from "drizzle-orm";
import { translations, translationsLanguages, locales } from "../db/schema.ts";

type Db = BaseSQLiteDatabase<"sync" | "async", unknown, Record<string, never>>;

const POST_TYPE_NAMESPACE = "postType";
const LOCALE_CODES = ["pt_BR", "es_ES", "en_US"] as const;

export interface PostTypeTranslationValues {
  pt_BR: string;
  es_ES: string;
  en_US: string;
}

export async function upsertPostTypeTranslations(
  db: Db,
  slug: string,
  values: PostTypeTranslationValues
): Promise<void> {
  const now = Date.now();

  const localeRows = await db
    .select({ id: locales.id, locale_code: locales.locale_code })
    .from(locales)
    .where(inArray(locales.locale_code, [...LOCALE_CODES]));

  const localeIdByCode = new Map<string, number>();
  for (const row of localeRows as { id: number; locale_code: string }[]) {
    localeIdByCode.set(row.locale_code, row.id);
  }

  let [translationRow] = await db
    .select({ id: translations.id })
    .from(translations)
    .where(and(eq(translations.namespace, POST_TYPE_NAMESPACE), eq(translations.key, slug)))
    .limit(1);

  if (!translationRow) {
    const [inserted] = await db
      .insert(translations)
      .values({
        namespace: POST_TYPE_NAMESPACE,
        key: slug,
        created_at: now,
        updated_at: now,
      })
      .returning({ id: translations.id });
    translationRow = inserted ?? undefined;
  } else {
    await db
      .update(translations)
      .set({ updated_at: now })
      .where(eq(translations.id, (translationRow as { id: number }).id));
  }

  if (!translationRow) return;
  const translationId = (translationRow as { id: number }).id;

  const valueByCode: Record<string, string> = {
    pt_BR: values.pt_BR ?? "",
    es_ES: values.es_ES ?? "",
    en_US: values.en_US ?? "",
  };

  for (const code of LOCALE_CODES) {
    const localeId = localeIdByCode.get(code);
    if (localeId == null) continue;
    const value = valueByCode[code] ?? "";

    const [existing] = await db
      .select({ id: translationsLanguages.id })
      .from(translationsLanguages)
      .where(
        and(
          eq(translationsLanguages.id_translations, translationId),
          eq(translationsLanguages.id_locale_code, localeId)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(translationsLanguages)
        .set({ value })
        .where(eq(translationsLanguages.id, (existing as { id: number }).id));
    } else {
      await db.insert(translationsLanguages).values({
        id_translations: translationId,
        id_locale_code: localeId,
        value,
      });
    }
  }
}
