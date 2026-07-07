/**
 * Taxonomy helpers for the public theme (DB lookups).
 * URL routing is file-based; taxonomy type is the first static URL segment.
 */
import type { Database } from "../../shared/types/database.ts";
import {
  getLocalizedTaxonomyTerm,
  resolveTaxonomyTermBySlug,
  type TaxonomyTermRow,
} from "../services/taxonomy-translation-service.ts";
import { taxonomies } from "../../db/schema.ts";

export type PublicTaxonomyTerm = TaxonomyTermRow;

export function buildTaxonomyPublicPath(
  taxonomyType: string,
  termSlug: string,
  localePrefix: string,
): string {
  const prefix = localePrefix.replace(/\/+$/, "");
  return `${prefix}/${taxonomyType}/${termSlug}`;
}

export async function getPublicTaxonomyTerm(
  db: Database,
  taxonomyType: string,
  termSlug: string,
  localeCode?: string | null,
): Promise<PublicTaxonomyTerm | null> {
  return resolveTaxonomyTermBySlug(db, taxonomyType, termSlug, localeCode);
}

export async function getExistingTaxonomyTypes(db: Database): Promise<string[]> {
  const rows = await db
    .selectDistinct({ type: taxonomies.type })
    .from(taxonomies);
  const types = new Set<string>();
  for (const row of rows) {
    const type = String(row.type ?? "").trim();
    if (type) types.add(type);
  }
  return [...types];
}

export async function localizePublicTaxonomyTerm(
  db: Database,
  term: PublicTaxonomyTerm,
  localeCode: string,
): Promise<{ slug: string; name: string }> {
  const localized = await getLocalizedTaxonomyTerm(db, term, localeCode);
  return { slug: localized.slug, name: localized.name };
}
