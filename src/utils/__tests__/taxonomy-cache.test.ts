import { describe, it, expect, vi } from "vitest";
import {
  buildTaxonomyTermCacheKey,
  buildTaxonomyI18nCacheKey,
  buildTaxonomyTypeOriginalCacheKey,
  getTaxonomyTermFromCache,
  putTaxonomyTermCache,
  getTaxonomyI18nFromCache,
  putTaxonomyI18nCache,
  getTaxonomyTypesFromCache,
  putTaxonomyTypesCache,
  TAXONOMY_TYPES_CACHE_KEY,
} from "../taxonomy-cache.ts";

describe("taxonomy-cache", () => {
  it("builds stable keys", () => {
    expect(buildTaxonomyTermCacheKey("category", "news")).toBe("taxonomy:term:category:news");
    expect(buildTaxonomyI18nCacheKey("taxonomy.slug", "news", "en")).toBe(
      "taxonomy:i18n:taxonomy.slug:news:en",
    );
    expect(buildTaxonomyTypeOriginalCacheKey("category")).toBe("taxonomy:type-original:category");
  });

  it("stores and reads taxonomy terms including null", async () => {
    const store = new Map<string, string>();
    const kv = {
      get: vi.fn(async (key: string) => {
        if (!store.has(key)) return undefined;
        return JSON.parse(store.get(key)!);
      }),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    };
    const key = buildTaxonomyTermCacheKey("category", "news");
    expect(await getTaxonomyTermFromCache(kv, key)).toBeUndefined();
    await putTaxonomyTermCache(kv, key, null);
    expect(await getTaxonomyTermFromCache(kv, key)).toBeNull();
    await putTaxonomyTermCache(kv, key, {
      id: 1,
      name: "News",
      slug: "news",
      type: "category",
    });
    expect(await getTaxonomyTermFromCache(kv, key)).toEqual({
      id: 1,
      name: "News",
      slug: "news",
      type: "category",
    });
  });

  it("stores i18n values and taxonomy types list", async () => {
    const store = new Map<string, string>();
    const kv = {
      get: vi.fn(async (key: string) => {
        if (!store.has(key)) return undefined;
        return JSON.parse(store.get(key)!);
      }),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    };
    const i18nKey = buildTaxonomyI18nCacheKey("taxonomy.slug", "news", "en");
    await putTaxonomyI18nCache(kv, i18nKey, "noticias");
    expect(await getTaxonomyI18nFromCache(kv, i18nKey)).toBe("noticias");
    await putTaxonomyTypesCache(kv, ["category", "tag"]);
    expect(await getTaxonomyTypesFromCache(kv)).toEqual(["category", "tag"]);
    expect(store.has(TAXONOMY_TYPES_CACHE_KEY)).toBe(true);
  });
});
