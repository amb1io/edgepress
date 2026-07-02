import { describe, it, expect, vi } from "vitest";
import {
  buildRelatedPostsCacheKey,
  createMemoryRelatedPostsCacheStore,
  getRelatedPostsFromCache,
  normalizeRelatedPostsLimit,
  putRelatedPostsCache,
} from "../related-posts-cache.ts";

describe("related-posts-cache", () => {
  it("builds stable cache keys", () => {
    expect(
      buildRelatedPostsCacheKey({
        postId: 123,
        localeCode: "pt_BR",
        limit: 4,
        status: "published",
      }),
    ).toBe("related:post:id:123:locale=pt_BR:limit=4:status=published");
  });

  it("normalizes limit with default 4", () => {
    expect(normalizeRelatedPostsLimit()).toBe(4);
    expect(normalizeRelatedPostsLimit(0)).toBe(4);
    expect(normalizeRelatedPostsLimit(6)).toBe(6);
  });

  it("stores and reads related post ids from KV", async () => {
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
    const key = buildRelatedPostsCacheKey({
      postId: 10,
      localeCode: "pt_BR",
      limit: 4,
    });

    expect(await getRelatedPostsFromCache(kv, key)).toBeNull();
    await putRelatedPostsCache(kv, key, [5, 6]);
    expect(await getRelatedPostsFromCache(kv, key)).toEqual([5, 6]);
  });

  it("supports in-memory store for CLI dev", () => {
    const cache = createMemoryRelatedPostsCacheStore();
    const key = "related:post:id:1:locale=_:limit=4:status=published";
    expect(cache.get(key)).toBeNull();
    cache.set(key, [2, 3]);
    expect(cache.get(key)).toEqual([2, 3]);
  });
});
