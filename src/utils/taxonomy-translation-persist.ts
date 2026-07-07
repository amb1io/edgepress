/**
 * Persistência de traduções de termos de taxonomia (nome + slug).
 */
import { and, eq } from "drizzle-orm";
import { locales, translations, translationsLanguages } from "../db/schema.ts";
import type { Database } from "../shared/types/database.ts";
import {
  TAXONOMY_SLUG_I18N_NAMESPACE,
  TAXONOMY_TYPE_I18N_NAMESPACE,
} from "../core/services/taxonomy-type-registry.ts";
import {
  deleteTaxonomyTranslationByKey,
  validateTaxonomySlugTranslations,
} from "../core/services/taxonomy-translation-service.ts";
import {
  parseTaxonomyNameTranslationRows,
  parseTaxonomySlugTranslationRows,
} from "./taxonomy-translation-form.ts";
import { upsertNamespaceTranslationRows } from "./translation-upsert.ts";

export async function persistTaxonomyTermTranslations(
  db: Database,
  formData: FormData,
  taxonomyType: string,
  canonicalSlug: string,
  excludeCanonicalSlug?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nameRows = await parseTaxonomyNameTranslationRows(db, formData);
  const slugRows = await parseTaxonomySlugTranslationRows(db, formData);

  const conflict = await validateTaxonomySlugTranslations(
    db,
    taxonomyType,
    slugRows,
    excludeCanonicalSlug ?? canonicalSlug,
  );
  if (conflict) {
    return { ok: false, error: conflict };
  }

  if (nameRows.length > 0) {
    await upsertNamespaceTranslationRows(
      db,
      TAXONOMY_TYPE_I18N_NAMESPACE,
      canonicalSlug,
      nameRows,
    );
  }

  if (slugRows.length > 0) {
    await upsertNamespaceTranslationRows(
      db,
      TAXONOMY_SLUG_I18N_NAMESPACE,
      canonicalSlug,
      slugRows,
    );
  }

  return { ok: true };
}

export async function migrateTaxonomyTermTranslationKeys(
  db: Database,
  previousSlug: string,
  nextSlug: string,
): Promise<void> {
  if (!previousSlug || previousSlug === nextSlug) return;

  const nameRows = await loadNamespaceTranslationRows(db, TAXONOMY_TYPE_I18N_NAMESPACE, previousSlug);
  const slugRows = await loadNamespaceTranslationRows(db, TAXONOMY_SLUG_I18N_NAMESPACE, previousSlug);

  await deleteTaxonomyTranslationByKey(db, TAXONOMY_TYPE_I18N_NAMESPACE, previousSlug);
  await deleteTaxonomyTranslationByKey(db, TAXONOMY_SLUG_I18N_NAMESPACE, previousSlug);

  if (nameRows.length > 0) {
    await upsertNamespaceTranslationRows(db, TAXONOMY_TYPE_I18N_NAMESPACE, nextSlug, nameRows);
  }
  if (slugRows.length > 0) {
    await upsertNamespaceTranslationRows(db, TAXONOMY_SLUG_I18N_NAMESPACE, nextSlug, slugRows);
  }
}

export async function deleteTaxonomyTermTranslations(
  db: Database,
  canonicalSlug: string,
): Promise<void> {
  if (!canonicalSlug) return;
  await deleteTaxonomyTranslationByKey(db, TAXONOMY_TYPE_I18N_NAMESPACE, canonicalSlug);
  await deleteTaxonomyTranslationByKey(db, TAXONOMY_SLUG_I18N_NAMESPACE, canonicalSlug);
}

async function loadNamespaceTranslationRows(
  db: Database,
  namespace: string,
  key: string,
): Promise<{ locale_id: number; value: string }[]> {
  const [translationRow] = await db
    .select({ id: translations.id })
    .from(translations)
    .where(and(eq(translations.namespace, namespace), eq(translations.key, key)))
    .limit(1);

  if (!translationRow) return [];

  const rows = await db
    .select({
      locale_id: translationsLanguages.id_locale_code,
      value: translationsLanguages.value,
    })
    .from(translationsLanguages)
    .where(eq(translationsLanguages.id_translations, translationRow.id));

  return rows
    .map((row) => ({
      locale_id: row.locale_id,
      value: String(row.value ?? "").trim(),
    }))
    .filter((row) => row.locale_id && row.value);
}

export async function loadTaxonomyTranslationValuesByCode(
  db: Database,
  namespace: string,
  canonicalSlug: string,
): Promise<Record<string, string>> {
  const [translationRow] = await db
    .select({ id: translations.id })
    .from(translations)
    .where(and(eq(translations.namespace, namespace), eq(translations.key, canonicalSlug)))
    .limit(1);

  if (!translationRow) return {};

  const rows = await db
    .select({
      locale_code: locales.locale_code,
      value: translationsLanguages.value,
    })
    .from(translationsLanguages)
    .innerJoin(locales, eq(translationsLanguages.id_locale_code, locales.id))
    .where(eq(translationsLanguages.id_translations, translationRow.id));

  return Object.fromEntries(rows.map((row) => [row.locale_code, row.value ?? ""]));
}
