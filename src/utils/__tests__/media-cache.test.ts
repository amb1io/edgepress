import { describe, it, expect, vi } from "vitest";
import {
  buildMediaIdCacheKey,
  buildMediaListCacheKey,
  getMediaFromCache,
  putMediaCache,
  getMediaListFromCache,
  putMediaListCache,
} from "../media-cache.ts";

describe("media-cache", () => {
  it("builds media keys", () => {
    expect(buildMediaIdCacheKey(9)).toBe("media:id:9");
    expect(buildMediaListCacheKey(50, "Logo")).toBe("media:list:limit=50:search=logo");
  });

  it("stores and reads media by id including null", async () => {
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
    expect(await getMediaFromCache(kv, 1)).toBeUndefined();
    await putMediaCache(kv, 1, null);
    expect(await getMediaFromCache(kv, 1)).toBeNull();
  });

  it("stores media lists", async () => {
    const store = new Map<string, string>();
    const kv = {
      get: vi.fn(async (key: string) => {
        const raw = store.get(key);
        return raw ? JSON.parse(raw) : null;
      }),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    };
    const key = buildMediaListCacheKey(10);
    const list = [
      {
        id: 1,
        title: "a",
        slug: "a",
        excerpt: null,
        body: null,
        author_id: null,
        meta_values: null,
        created_at: 0,
        updated_at: 0,
      },
    ];
    await putMediaListCache(kv, key, list as never);
    expect(await getMediaListFromCache(kv, key)).toEqual(list);
  });
});
