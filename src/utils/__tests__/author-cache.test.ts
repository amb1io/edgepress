import { describe, it, expect, vi } from "vitest";
import {
  buildAuthorCacheKey,
  createMemoryAuthorCacheStore,
  getAuthorFromCache,
  putAuthorCache,
} from "../author-cache.ts";

describe("author-cache", () => {
  it("builds stable cache keys", () => {
    expect(buildAuthorCacheKey("wp-user-3")).toBe("author:user:wp-user-3");
  });

  it("stores and reads author from KV", async () => {
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
    const key = buildAuthorCacheKey("user-1");
    const author = { name: "Rhamses", image: "https://example.com/a.jpg", description: "Bio" };

    expect(await getAuthorFromCache(kv, key)).toBeNull();
    await putAuthorCache(kv, key, author);
    expect(await getAuthorFromCache(kv, key)).toEqual(author);
  });

  it("supports in-memory store for CLI dev", () => {
    const cache = createMemoryAuthorCacheStore();
    const key = buildAuthorCacheKey("user-1");
    expect(cache.get(key)).toBeNull();
    const author = { name: "A", image: "", description: "" };
    cache.set(key, author);
    expect(cache.get(key)).toEqual(author);
    cache.delete(key);
    expect(cache.get(key)).toBeNull();
  });
});
