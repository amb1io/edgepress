/**
 * WordPress-style taxonomy archive URLs for the public theme.
 *
 * URL base → DB taxonomy type (built-in):
 *   /category/{slug} → type `category`
 *   /tag/{slug}      → type `tag`
 *
 * Custom taxonomy types (phase 2): extend TAXONOMY_URL_BASES or map via taxonomy-type-registry.
 */
import { and, eq } from "drizzle-orm";
import { taxonomies } from "../../db/schema.ts";
import type { Database } from "../../shared/types/database.ts";

/** WordPress permalink segment → `edp_taxonomies.type`. */
export const TAXONOMY_URL_BASES: Record<string, string> = {
  category: "category",
  tag: "tag",
};

export type ResolvedTaxonomyRoute = {
  taxonomyBase: string;
  taxonomyType: string;
  termSlug: string;
};

export function resolveTaxonomyUrlBase(segment: string): string | null {
  const key = segment.trim().toLowerCase();
  return key in TAXONOMY_URL_BASES ? key : null;
}

export function resolveTaxonomyFromSegments(segments: string[]): ResolvedTaxonomyRoute | null {
  if (segments.length !== 2) return null;
  const taxonomyBase = resolveTaxonomyUrlBase(segments[0] ?? "");
  if (!taxonomyBase) return null;
  const termSlug = (segments[1] ?? "").trim();
  if (!termSlug) return null;
  return {
    taxonomyBase,
    taxonomyType: TAXONOMY_URL_BASES[taxonomyBase]!,
    termSlug,
  };
}

export function buildTaxonomyPublicPath(
  taxonomyBase: string,
  termSlug: string,
  localePrefix: string,
): string {
  const prefix = localePrefix.replace(/\/+$/, "");
  return `${prefix}/${taxonomyBase}/${termSlug}`;
}

/** Maps DB taxonomy type to URL segment (category/tag use fixed bases; custom types use type slug). */
export function taxonomyTypeToUrlBase(type: string): string {
  const entry = Object.entries(TAXONOMY_URL_BASES).find(([, t]) => t === type);
  return entry?.[0] ?? type;
}

export type PublicTaxonomyTerm = {
  id: number;
  name: string;
  slug: string;
  type: string;
};

export async function getPublicTaxonomyTerm(
  db: Database,
  taxonomyType: string,
  termSlug: string,
): Promise<PublicTaxonomyTerm | null> {
  const type = taxonomyType.trim();
  const slug = termSlug.trim();
  if (!type || !slug) return null;

  const [row] = await db
    .select({
      id: taxonomies.id,
      name: taxonomies.name,
      slug: taxonomies.slug,
      type: taxonomies.type,
    })
    .from(taxonomies)
    .where(and(eq(taxonomies.type, type), eq(taxonomies.slug, slug)))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    type: String(row.type ?? type),
  };
}
