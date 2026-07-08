import { describe, it, expect, vi } from "vitest";
import {
  buildMenuCacheKey,
  getMenusFromCache,
  putMenusCache,
} from "../menu-cache.ts";

describe("menu-cache", () => {
  it("builds locale-scoped keys", () => {
    expect(buildMenuCacheKey("pt_BR")).toBe("menu:pt_BR");
    expect(buildMenuCacheKey("")).toBe("menu:_");
  });

  it("stores and reads menus from KV", async () => {
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
    const key = buildMenuCacheKey("pt_BR");
    expect(await getMenusFromCache(kv, key)).toBeNull();
    await putMenusCache(kv, key, { primary: [] });
    expect(await getMenusFromCache(kv, key)).toEqual({ primary: [] });
  });

  it("returns null when KV throws", async () => {
    const kv = {
      get: vi.fn(async () => {
        throw new Error("kv down");
      }),
      put: vi.fn(),
    };
    expect(await getMenusFromCache(kv, "menu:pt_BR")).toBeNull();
  });
});
