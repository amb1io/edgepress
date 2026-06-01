/**
 * Upsert em translations + translations_languages por namespace/key.
 */
import { and, eq } from "drizzle-orm";
import { translations, translationsLanguages } from "../db/schema.ts";
import type { Database } from "../shared/types/database.ts";

export type TranslationLocaleRow = {
  locale_id: number;
  value: string;
};

export async function upsertNamespaceTranslationRows(
  db: Database,
  namespace: string,
  key: string,
  rows: TranslationLocaleRow[]
): Promise<void> {
  const now = Date.now();
  const seenLocales = new Set<number>();

  let [translationRow] = await db
    .select({ id: translations.id })
    .from(translations)
    .where(and(eq(translations.namespace, namespace), eq(translations.key, key)))
    .limit(1);

  if (!translationRow) {
    const [inserted] = await db
      .insert(translations)
      .values({
        namespace,
        key,
        created_at: now,
        updated_at: now,
      })
      .returning({ id: translations.id });
    translationRow = inserted ?? undefined;
  } else {
    await db
      .update(translations)
      .set({ updated_at: now })
      .where(eq(translations.id, translationRow.id));
  }

  if (!translationRow) return;
  const translationId = translationRow.id;

  for (const row of rows) {
    const localeId = row.locale_id;
    const value = (row.value ?? "").trim();
    if (!localeId || !value || seenLocales.has(localeId)) continue;
    seenLocales.add(localeId);

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
        .where(eq(translationsLanguages.id, existing.id));
    } else {
      await db.insert(translationsLanguages).values({
        id_translations: translationId,
        id_locale_code: localeId,
        value,
      });
    }
  }
}
