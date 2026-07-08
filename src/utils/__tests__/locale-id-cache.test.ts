import { describe, it, expect } from "vitest";
import {
  buildLocaleIdCacheKey,
  getLocaleIdFromCache,
  putLocaleIdCache,
} from "../../core/services/post-translation-service.ts";

describe("locale id cache", () => {
  it("builds locale keys", () => {
    expect(buildLocaleIdCacheKey("pt_BR")).toBe("locale:id:pt_BR");
  });

  it("stores and reads locale ids including null", async () => {
    const store = new Map<string, string>();
    const kv = {
      get: async (key: string) => {
        if (!store.has(key)) return undefined;
        return JSON.parse(store.get(key)!);
      },
      put: async (key: string, value: string) => {
        store.set(key, value);
      },
    };
    const key = buildLocaleIdCacheKey("en");
    expect(await getLocaleIdFromCache(kv, key)).toBeUndefined();
    await putLocaleIdCache(kv, key, 3);
    expect(await getLocaleIdFromCache(kv, key)).toBe(3);
    await putLocaleIdCache(kv, key, null);
    expect(await getLocaleIdFromCache(kv, key)).toBeNull();
  });
});
