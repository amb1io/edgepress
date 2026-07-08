import { describe, it, expect, vi } from "vitest";
import {
  buildThemeContentCacheKey,
  getThemeContentFromCache,
  putThemeContentCache,
} from "../theme-content-cache.ts";

describe("theme-content-cache", () => {
  it("builds stable resource keys from sorted params", () => {
    expect(buildThemeContentCacheKey("posts", { b: "2", a: "1" })).toBe(
      'theme-content:posts:[["a","1"],["b","2"]]',
    );
  });

  it("stores and reads theme content payloads", async () => {
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
    const key = buildThemeContentCacheKey("posts", {});
    expect(await getThemeContentFromCache(kv, key)).toBeNull();
    await putThemeContentCache(kv, key, [{ id: 1 }]);
    expect(await getThemeContentFromCache(kv, key)).toEqual([{ id: 1 }]);
  });
});
