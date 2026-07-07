/**
 * Registry global de tipos de taxonomia (built-in + custom via translations namespace taxonomyType).
 */
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { translations, taxonomies, locales, translationsLanguages } from "../../db/schema.ts";
import type { Database } from "../../shared/types/database.ts";
import type { MetaSchemaItem } from "../../db/schema/meta_schema.ts";
import { ADMIN_DB_LOCALE_CODES } from "../../utils/admin-locale-constants.ts";
import { slugify } from "../../utils/slugify.ts";
import { upsertNamespaceTranslationRows } from "../../utils/translation-upsert.ts";
import { getTaxonomyTypeRootId } from "./taxonomy-service.ts";

export const TAXONOMY_TYPE_NAMESPACE = "taxonomyType";
/** Namespace i18n usado por t('taxonomy.type.{slug}') no admin e menu. */
export const TAXONOMY_TYPE_I18N_NAMESPACE = "taxonomy.type";
/** Slug traduzido por locale; key = slug canônico do termo. */
export const TAXONOMY_SLUG_I18N_NAMESPACE = "taxonomy.slug";
export const MENU_OPTION_NAMESPACE = "menu.option";

/** Chave em menu.option para label do item de menu (ex.: taxonomies_type_genero). */
export function taxonomyTypeMenuOptionKey(typeSlug: string): string {
  return `taxonomies_type_${typeSlug}`;
}

/** Grava traduções nos namespaces taxonomyType, taxonomy.type e menu.option. */
export async function upsertTaxonomyTypeTranslationNamespaces(
  db: Database,
  typeSlug: string,
  rows: TaxonomyTranslationInput[]
): Promise<void> {
  await upsertNamespaceTranslationRows(db, TAXONOMY_TYPE_NAMESPACE, typeSlug, rows);
  await upsertNamespaceTranslationRows(db, TAXONOMY_TYPE_I18N_NAMESPACE, typeSlug, rows);
  await upsertNamespaceTranslationRows(
    db,
    MENU_OPTION_NAMESPACE,
    taxonomyTypeMenuOptionKey(typeSlug),
    rows
  );
}
export const BUILTIN_TAXONOMY_TYPES = ["category", "tag"] as const;
export type BuiltinTaxonomyType = (typeof BUILTIN_TAXONOMY_TYPES)[number];

export type TaxonomyTypeListItem = {
  type: string;
  label: string;
  isBuiltin: boolean;
};

export type TaxonomyTranslationInput = {
  locale_id: number;
  value: string;
};

/**
 * Monta o array taxonomy do post type (modelo híbrido: inclui taxonomia_{slug} se houver custom selecionado).
 */
export function buildPostTypeTaxonomyArray(
  selectedTypes: string[],
  postTypeSlug: string
): string[] {
  const builtin = new Set<string>(BUILTIN_TAXONOMY_TYPES);
  const trimmed = selectedTypes.map((t) => t.trim()).filter(Boolean);
  const hasCustom = trimmed.some((t) => !builtin.has(t) && !t.startsWith("taxonomia_"));
  const result = [...trimmed];
  if (hasCustom && postTypeSlug.trim()) {
    const bucket = `taxonomia_${postTypeSlug.trim()}`;
    if (!result.includes(bucket)) result.push(bucket);
  }
  return [...new Set(result)];
}

export async function ensureTaxonomyRoots(db: Database, types: string[]): Promise<void> {
  for (const type of types) {
    await getTaxonomyTypeRootId(db, type);
  }
}

/** Remove tipos bucket taxonomia_{slug} da lista exibida em checkboxes. */
export function filterTaxonomyTypesForUi(types: string[]): string[] {
  return types.filter((t) => !t.startsWith("taxonomia_"));
}

export function withTaxonomyInMetaSchema(
  meta_schema: MetaSchemaItem[],
  taxonomy: string[]
): MetaSchemaItem[] {
  const rest = meta_schema.filter((s) => s.key !== "taxonomy");
  return [...rest, { key: "taxonomy", type: "array", default: taxonomy }];
}

export async function applyPostTypeTaxonomySave(
  db: Database,
  meta_schema: MetaSchemaItem[],
  meta_values: Record<string, unknown>,
  postTypeSlug: string
): Promise<{ meta_schema: MetaSchemaItem[]; meta_values: Record<string, unknown> }> {
  const raw = Array.isArray(meta_values.taxonomy)
    ? (meta_values.taxonomy as string[])
    : [];
  const selected = filterTaxonomyTypesForUi(raw.map(String));
  const taxonomy = buildPostTypeTaxonomyArray(selected, postTypeSlug);
  await ensureTaxonomyRoots(db, taxonomy);
  return {
    meta_schema: withTaxonomyInMetaSchema(meta_schema, taxonomy),
    meta_values: { ...meta_values, taxonomy },
  };
}

export async function listTaxonomyTypes(
  db: Database,
  _adminLocale: string
): Promise<TaxonomyTypeListItem[]> {
  const roots = await db
    .select({
      type: taxonomies.type,
      label: taxonomies.name,
    })
    .from(taxonomies)
    .where(or(isNull(taxonomies.parent_id), eq(taxonomies.parent_id, 0)))
    .orderBy(taxonomies.name);

  const items: TaxonomyTypeListItem[] = [];
  const seen = new Set<string>();
  const builtinSet = new Set<string>(BUILTIN_TAXONOMY_TYPES);
  for (const row of roots) {
    const type = (row.type ?? "").trim();
    if (!type || seen.has(type)) continue;
    seen.add(type);
    items.push({
      type,
      label: (row.label ?? "").trim() || type,
      isBuiltin: builtinSet.has(type as BuiltinTaxonomyType),
    });
  }

  return items;
}

/**
 * Garante pt_BR, es_ES e en_US com valor (tradução do formulário ou nome da categoria).
 */
export async function mergeTaxonomyTranslationsWithAdminFallback(
  db: Database,
  categoryName: string,
  translations: TaxonomyTranslationInput[]
): Promise<TaxonomyTranslationInput[]> {
  const adminRows = await db
    .select({ id: locales.id })
    .from(locales)
    .where(inArray(locales.locale_code, [...ADMIN_DB_LOCALE_CODES]));

  const merged = new Map<number, string>();
  for (const row of translations) {
    const value = (row.value ?? "").trim();
    if (row.locale_id && value) merged.set(row.locale_id, value);
  }
  for (const admin of adminRows) {
    if (!merged.has(admin.id)) merged.set(admin.id, categoryName);
  }
  return [...merged.entries()].map(([locale_id, value]) => ({ locale_id, value }));
}

async function taxonomyTypeExists(db: Database, slug: string): Promise<boolean> {
  const [tr] = await db
    .select({ id: translations.id })
    .from(translations)
    .where(and(eq(translations.namespace, TAXONOMY_TYPE_NAMESPACE), eq(translations.key, slug)))
    .limit(1);
  if (tr) return true;

  const [tx] = await db
    .select({ id: taxonomies.id })
    .from(taxonomies)
    .where(eq(taxonomies.type, slug))
    .limit(1);
  return Boolean(tx);
}

export async function createTaxonomyType(
  db: Database,
  params: {
    /** Nome da categoria (título inserido no modal; também usado no painel de categorização). */
    name: string;
    translations: TaxonomyTranslationInput[];
  }
): Promise<{ type: string; label: string; key: string }> {
  const name = params.name.trim();
  if (!name) throw new Error("NAME_REQUIRED");

  const slug = slugify(name);
  if (!slug) throw new Error("INVALID_SLUG");

  if (BUILTIN_TAXONOMY_TYPES.includes(slug as BuiltinTaxonomyType)) {
    throw new Error("BUILTIN_RESERVED");
  }

  if (await taxonomyTypeExists(db, slug)) {
    throw new Error("SLUG_EXISTS");
  }

  const mergedTranslations = await mergeTaxonomyTranslationsWithAdminFallback(
    db,
    name,
    params.translations
  );

  await upsertTaxonomyTypeTranslationNamespaces(db, slug, mergedTranslations);

  await getTaxonomyTypeRootId(db, slug, { displayName: name });

  return { type: slug, key: slug, label: name };
}

/**
 * Remove namespaces de tradução ligados a um tipo de taxonomia customizado.
 * Não remove tipos built-in (category/tag).
 */
export async function removeTaxonomyTypeTranslationNamespaces(
  db: Database,
  typeSlug: string
): Promise<void> {
  if (!typeSlug || BUILTIN_TAXONOMY_TYPES.includes(typeSlug as BuiltinTaxonomyType)) return;

  const keys = [
    { namespace: TAXONOMY_TYPE_NAMESPACE, key: typeSlug },
    { namespace: TAXONOMY_TYPE_I18N_NAMESPACE, key: typeSlug },
    { namespace: MENU_OPTION_NAMESPACE, key: taxonomyTypeMenuOptionKey(typeSlug) },
  ];

  for (const item of keys) {
    const [translationRow] = await db
      .select({ id: translations.id })
      .from(translations)
      .where(and(eq(translations.namespace, item.namespace), eq(translations.key, item.key)))
      .limit(1);
    if (!translationRow) continue;

    await db
      .delete(translationsLanguages)
      .where(eq(translationsLanguages.id_translations, translationRow.id));
    await db.delete(translations).where(eq(translations.id, translationRow.id));
  }
}
