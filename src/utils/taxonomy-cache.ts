import type { KVLike } from "./content-cache.ts";
import type { TaxonomyTermRow } from "../core/services/taxonomy-translation-service.ts";

export const TAXONOMY_CACHE_PREFIX = "taxonomy:";
export const TAXONOMY_I18N_CACHE_PREFIX = "taxonomy:i18n:";
export const TAXONOMY_TYPES_CACHE_KEY = "taxonomy:types";

export function buildTaxonomyTermCacheKey(taxonomyType: string, slug: string): string {
  return `taxonomy:term:${taxonomyType.trim()}:${slug.trim()}`;
}

export function buildTaxonomyI18nCacheKey(
  namespace: string,
  key: string,
  locale: string,
): string {
  return `taxonomy:i18n:${namespace.trim()}:${key.trim()}:${locale.trim()}`;
}

export function buildTaxonomyTypeOriginalCacheKey(taxonomyType: string): string {
  return `taxonomy:type-original:${taxonomyType.trim()}`;
}

export async function getTaxonomyTermFromCache(
  kv: KVLike | null | undefined,
  key: string,
): Promise<TaxonomyTermRow | null | undefined> {
  if (!kv) return undefined;
  try {
    const cached = (await kv.get(key, "json")) as unknown;
    if (cached === null) return null;
    if (!cached || typeof cached !== "object") return undefined;
    const row = cached as Record<string, unknown>;
    return {
      id: Number(row.id ?? 0),
      name: String(row.name ?? ""),
      slug: String(row.slug ?? ""),
      type: String(row.type ?? ""),
    };
  } catch {
    return undefined;
  }
}

export async function putTaxonomyTermCache(
  kv: KVLike | null | undefined,
  key: string,
  term: TaxonomyTermRow | null,
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(term));
  } catch {
    // ignora falha de KV
  }
}

export async function getTaxonomyI18nFromCache(
  kv: KVLike | null | undefined,
  key: string,
): Promise<string | null | undefined> {
  if (!kv) return undefined;
  try {
    const cached = (await kv.get(key, "json")) as unknown;
    if (cached === null) return null;
    if (typeof cached !== "string") return undefined;
    return cached;
  } catch {
    return undefined;
  }
}

export async function putTaxonomyI18nCache(
  kv: KVLike | null | undefined,
  key: string,
  value: string | null,
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(value));
  } catch {
    // ignora falha de KV
  }
}

export async function getTaxonomyTypeOriginalFromCache(
  kv: KVLike | null | undefined,
  key: string,
): Promise<{ original_name: string; original_slug: string } | undefined> {
  if (!kv) return undefined;
  try {
    const cached = (await kv.get(key, "json")) as unknown;
    if (!cached || typeof cached !== "object") return undefined;
    const row = cached as Record<string, unknown>;
    return {
      original_name: String(row.original_name ?? ""),
      original_slug: String(row.original_slug ?? ""),
    };
  } catch {
    return undefined;
  }
}

export async function putTaxonomyTypeOriginalCache(
  kv: KVLike | null | undefined,
  key: string,
  value: { original_name: string; original_slug: string },
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(value));
  } catch {
    // ignora falha de KV
  }
}

export async function getTaxonomyTypesFromCache(
  kv: KVLike | null | undefined,
): Promise<string[] | null> {
  if (!kv) return null;
  try {
    const cached = (await kv.get(TAXONOMY_TYPES_CACHE_KEY, "json")) as unknown;
    if (!Array.isArray(cached)) return null;
    return cached.map((item) => String(item));
  } catch {
    return null;
  }
}

export async function putTaxonomyTypesCache(
  kv: KVLike | null | undefined,
  types: string[],
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(TAXONOMY_TYPES_CACHE_KEY, JSON.stringify(types));
  } catch {
    // ignora falha de KV
  }
}
