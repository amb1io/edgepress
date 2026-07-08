import { describe, it, expect, vi } from "vitest";
import {
  buildCustomFieldsCacheKey,
  getCustomFieldsFromCache,
  putCustomFieldsCache,
  deleteCustomFieldsCache,
} from "../custom-fields-cache.ts";

describe("custom-fields-cache", () => {
  it("builds post-scoped keys", () => {
    expect(buildCustomFieldsCacheKey(42)).toBe("post:customfields:42");
  });

  it("stores and reads custom fields", async () => {
    const store = new Map<string, string>();
    const kv = {
      get: vi.fn(async (key: string) => {
        const raw = store.get(key);
        return raw ? JSON.parse(raw) : null;
      }),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    };
    expect(await getCustomFieldsFromCache(kv, 10)).toBeNull();
    const fields = [{ id: 1, title: "Block", slug: "block", fields: [], template: false }];
    await putCustomFieldsCache(kv, 10, fields);
    expect(await getCustomFieldsFromCache(kv, 10)).toEqual(fields);
    await deleteCustomFieldsCache(kv, 10);
    expect(await getCustomFieldsFromCache(kv, 10)).toBeNull();
  });
});
