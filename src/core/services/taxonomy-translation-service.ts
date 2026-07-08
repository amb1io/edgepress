/**
 * Resolução de termos de taxonomia por slug canônico ou traduzido (namespace taxonomy.slug).
 */
import { and, eq, ne, or, isNull } from "drizzle-orm";
import { taxonomies, translations, translationsLanguages } from "../../db/schema.ts";
import type { Database } from "../../shared/types/database.ts";
import type { KVLike } from "../../utils/content-cache.ts";
import {
  buildTaxonomyI18nCacheKey,
  buildTaxonomyTermCacheKey,
  buildTaxonomyTypeOriginalCacheKey,
  getTaxonomyI18nFromCache,
  getTaxonomyTermFromCache,
  getTaxonomyTypeOriginalFromCache,
  putTaxonomyI18nCache,
  putTaxonomyTermCache,
  putTaxonomyTypeOriginalCache,
} from "../../utils/taxonomy-cache.ts";
import {
  TAXONOMY_SLUG_I18N_NAMESPACE,
  TAXONOMY_TYPE_I18N_NAMESPACE,
} from "./taxonomy-type-registry.ts";
import { resolveLocaleId } from "./post-translation-service.ts";

export type TaxonomyTermRow = {
  id: number;
  name: string;
  slug: string;
  type: string;
};

export type TaxonomyCacheOptions = {
  kv?: KVLike | null;
};

export async function findTaxonomyByCanonicalSlug(
  db: Database,
  taxonomyType: string,
  slug: string,
  options: TaxonomyCacheOptions = {},
): Promise<TaxonomyTermRow | null> {
  const type = taxonomyType.trim();
  const canonical = slug.trim();
  if (!type || !canonical) return null;

  const cacheKey = buildTaxonomyTermCacheKey(type, canonical);
  const cached = await getTaxonomyTermFromCache(options.kv, cacheKey);
  if (cached !== undefined) return cached;

  const [row] = await db
    .select({
      id: taxonomies.id,
      name: taxonomies.name,
      slug: taxonomies.slug,
      type: taxonomies.type,
    })
    .from(taxonomies)
    .where(and(eq(taxonomies.type, type), eq(taxonomies.slug, canonical)))
    .limit(1);

  if (!row) {
    await putTaxonomyTermCache(options.kv, cacheKey, null);
    return null;
  }
  const term = {
    id: row.id,
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    type: String(row.type ?? type),
  };
  await putTaxonomyTermCache(options.kv, cacheKey, term);
  return term;
}

async function findCanonicalSlugByTranslatedSlug(
  db: Database,
  translatedSlug: string,
  localeId?: number | null,
): Promise<string | null> {
  const slug = translatedSlug.trim();
  if (!slug) return null;

  const baseQuery = db
    .select({ key: translations.key })
    .from(translationsLanguages)
    .innerJoin(translations, eq(translationsLanguages.id_translations, translations.id))
    .where(
      and(
        eq(translations.namespace, TAXONOMY_SLUG_I18N_NAMESPACE),
        eq(translationsLanguages.value, slug),
        ...(localeId != null ? [eq(translationsLanguages.id_locale_code, localeId)] : []),
      ),
    )
    .limit(1);

  const [row] = await baseQuery;
  return row?.key ? String(row.key) : null;
}

export async function resolveTaxonomyTermBySlug(
  db: Database,
  taxonomyType: string,
  slugOrTranslatedSlug: string,
  localeCode?: string | null,
  options: TaxonomyCacheOptions = {},
): Promise<TaxonomyTermRow | null> {
  const input = slugOrTranslatedSlug.trim();
  if (!input) return null;

  const direct = await findTaxonomyByCanonicalSlug(db, taxonomyType, input, options);
  if (direct) return direct;

  const localeId = localeCode ? await resolveLocaleId(localeCode, db, options) : null;

  if (localeId != null) {
    const canonical = await findCanonicalSlugByTranslatedSlug(db, input, localeId);
    if (canonical) {
      const term = await findTaxonomyByCanonicalSlug(db, taxonomyType, canonical, options);
      if (term) return term;
    }
  }

  const canonicalAny = await findCanonicalSlugByTranslatedSlug(db, input, null);
  if (!canonicalAny) return null;
  return findTaxonomyByCanonicalSlug(db, taxonomyType, canonicalAny, options);
}

export async function resolveTaxonomySlugForFilter(
  db: Database,
  taxonomyType: string,
  slugOrTranslatedSlug: string,
  localeCode?: string | null,
  options: TaxonomyCacheOptions = {},
): Promise<string | null> {
  const input = slugOrTranslatedSlug.trim();
  if (!input) return null;

  const direct = await findTaxonomyByCanonicalSlug(db, taxonomyType, input, options);
  if (direct) return direct.slug;

  const term = await resolveTaxonomyTermBySlug(db, taxonomyType, input, localeCode, options);
  return term?.slug ?? null;
}

async function getTranslationValue(
  db: Database,
  namespace: string,
  key: string,
  localeCode: string,
  options: TaxonomyCacheOptions = {},
): Promise<string | null> {
  const cacheKey = buildTaxonomyI18nCacheKey(namespace, key, localeCode);
  const cached = await getTaxonomyI18nFromCache(options.kv, cacheKey);
  if (cached !== undefined) return cached;

  const localeId = await resolveLocaleId(localeCode, db, options);
  if (localeId == null) {
    await putTaxonomyI18nCache(options.kv, cacheKey, null);
    return null;
  }

  const [row] = await db
    .select({ value: translationsLanguages.value })
    .from(translations)
    .innerJoin(translationsLanguages, eq(translationsLanguages.id_translations, translations.id))
    .where(
      and(
        eq(translations.namespace, namespace),
        eq(translations.key, key),
        eq(translationsLanguages.id_locale_code, localeId),
      ),
    )
    .limit(1);

  const value = row?.value?.trim() || null;
  await putTaxonomyI18nCache(options.kv, cacheKey, value);
  return value;
}

export async function getLocalizedTaxonomySlug(
  db: Database,
  canonicalSlug: string,
  localeCode: string,
  options: TaxonomyCacheOptions = {},
): Promise<string> {
  const key = canonicalSlug.trim();
  if (!key) return "";
  const translated = await getTranslationValue(
    db,
    TAXONOMY_SLUG_I18N_NAMESPACE,
    key,
    localeCode,
    options,
  );
  return translated ?? key;
}

export async function getLocalizedTaxonomyName(
  db: Database,
  canonicalSlug: string,
  fallbackName: string,
  localeCode: string,
  options: TaxonomyCacheOptions = {},
): Promise<string> {
  const key = canonicalSlug.trim();
  if (!key) return fallbackName;
  const translated = await getTranslationValue(
    db,
    TAXONOMY_TYPE_I18N_NAMESPACE,
    key,
    localeCode,
    options,
  );
  return translated ?? fallbackName;
}

export async function getLocalizedTaxonomyTerm(
  db: Database,
  term: TaxonomyTermRow,
  localeCode: string,
  options: TaxonomyCacheOptions = {},
): Promise<{ name: string; slug: string }> {
  const [name, slug] = await Promise.all([
    getLocalizedTaxonomyName(db, term.slug, term.name, localeCode, options),
    getLocalizedTaxonomySlug(db, term.slug, localeCode, options),
  ]);
  return { name, slug };
}

export async function getTaxonomyTypeOriginal(
  db: Database,
  taxonomyType: string,
  options: TaxonomyCacheOptions = {},
): Promise<{ original_name: string; original_slug: string }> {
  const canonical = taxonomyType.trim();
  if (!canonical) return { original_name: "", original_slug: "" };

  const cacheKey = buildTaxonomyTypeOriginalCacheKey(canonical);
  const cached = await getTaxonomyTypeOriginalFromCache(options.kv, cacheKey);
  if (cached) return cached;

  const [root] = await db
    .select({ name: taxonomies.name, slug: taxonomies.slug })
    .from(taxonomies)
    .where(
      and(
        eq(taxonomies.type, canonical),
        or(isNull(taxonomies.parent_id), eq(taxonomies.parent_id, 0)),
      ),
    )
    .limit(1);

  const value = {
    original_name: root?.name ? String(root.name) : canonical,
    original_slug: root?.slug ? String(root.slug) : canonical,
  };
  await putTaxonomyTypeOriginalCache(options.kv, cacheKey, value);
  return value;
}

export async function getTaxonomyTypeFallbackName(
  db: Database,
  taxonomyType: string,
  options: TaxonomyCacheOptions = {},
): Promise<string> {
  const { original_name } = await getTaxonomyTypeOriginal(db, taxonomyType, options);
  return original_name;
}

export async function getLocalizedTaxonomyType(
  db: Database,
  taxonomyType: string,
  localeCode: string,
  options: TaxonomyCacheOptions = {},
): Promise<{
  name: string;
  slug: string;
  original_name: string;
  original_slug: string;
}> {
  const canonical = taxonomyType.trim();
  if (!canonical) {
    return { name: "", slug: "", original_name: "", original_slug: "" };
  }

  const original = await getTaxonomyTypeOriginal(db, canonical, options);
  const [name, slug] = await Promise.all([
    getLocalizedTaxonomyName(db, canonical, original.original_name, localeCode, options),
    getLocalizedTaxonomySlug(db, canonical, localeCode, options),
  ]);
  return { name, slug, ...original };
}

export async function findTranslatedSlugConflict(
  db: Database,
  params: {
    taxonomyType: string;
    translatedSlug: string;
    localeId: number;
    excludeCanonicalSlug?: string | null;
  },
): Promise<boolean> {
  const slug = params.translatedSlug.trim();
  if (!slug) return false;

  const whereParts = [
    eq(translations.namespace, TAXONOMY_SLUG_I18N_NAMESPACE),
    eq(translationsLanguages.value, slug),
    eq(translationsLanguages.id_locale_code, params.localeId),
    eq(taxonomies.type, params.taxonomyType),
  ];
  if (params.excludeCanonicalSlug) {
    whereParts.push(ne(taxonomies.slug, params.excludeCanonicalSlug));
  }

  const [match] = await db
    .select({ key: translations.key })
    .from(translationsLanguages)
    .innerJoin(translations, eq(translationsLanguages.id_translations, translations.id))
    .innerJoin(taxonomies, eq(taxonomies.slug, translations.key))
    .where(and(...whereParts))
    .limit(1);

  return Boolean(match);
}

export async function validateTaxonomySlugTranslations(
  db: Database,
  taxonomyType: string,
  rows: { locale_id: number; value: string }[],
  excludeCanonicalSlug?: string | null,
): Promise<string | null> {
  const seen = new Map<number, string>();
  for (const row of rows) {
    const slug = row.value.trim();
    if (!slug) continue;

    const prev = seen.get(row.locale_id);
    if (prev && prev !== slug) {
      return "DUPLICATE_LOCALE_SLUG";
    }
    seen.set(row.locale_id, slug);

    const canonicalConflict = await findTaxonomyByCanonicalSlug(db, taxonomyType, slug);
    if (canonicalConflict && canonicalConflict.slug !== excludeCanonicalSlug) {
      return "SLUG_CONFLICT";
    }

    const translatedConflict = await findTranslatedSlugConflict(db, {
      taxonomyType,
      translatedSlug: slug,
      localeId: row.locale_id,
      excludeCanonicalSlug,
    });
    if (translatedConflict) {
      return "SLUG_CONFLICT";
    }
  }
  return null;
}

export async function deleteTaxonomyTranslationByKey(
  db: Database,
  namespace: string,
  key: string,
): Promise<void> {
  const [translationRow] = await db
    .select({ id: translations.id })
    .from(translations)
    .where(and(eq(translations.namespace, namespace), eq(translations.key, key)))
    .limit(1);
  if (!translationRow) return;
  await db
    .delete(translationsLanguages)
    .where(eq(translationsLanguages.id_translations, translationRow.id));
  await db.delete(translations).where(eq(translations.id, translationRow.id));
}
