import { describe, it, expect, vi, beforeEach } from "vitest";
import { invalidatePostCache } from "../kv-cache-sync.ts";
import type { Database } from "../types/database.ts";

function createMockKv(initialKeys: string[] = []) {
  const store = new Set(initialKeys);
  return {
    store,
    kv: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      list: vi.fn(async (options?: { prefix?: string; limit?: number; cursor?: string }) => {
        const prefix = options?.prefix ?? "";
        const keys = [...store]
          .filter((name) => name.startsWith(prefix))
          .map((name) => ({ name }));
        return { keys, list_complete: true };
      }),
    },
  };
}

vi.mock("../runtime-locals.ts", () => ({
  getKvFromLocals: vi.fn(),
}));

import { getKvFromLocals } from "../runtime-locals.ts";

describe("invalidatePostCache", () => {
  const mockDb = {} as Database;
  const locals = {} as App.Locals;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes post id, slug status variants and content:posts list keys", async () => {
    const { kv, store } = createMockKv([
      "post:id:42",
      "post:hello-world:status=published",
      "post:hello-world:status=published,draft",
      "content:posts:{\"page\":1}",
      "content:settings:{}",
    ]);
    vi.mocked(getKvFromLocals).mockReturnValue(kv);

    await invalidatePostCache(locals, mockDb, {
      id: 42,
      slug: "hello-world",
      status: "published",
      meta_values: null,
      id_locale_code: null,
      post_type_id: 1,
    });

    expect(store.has("post:id:42")).toBe(false);
    expect(store.has("post:hello-world:status=published")).toBe(false);
    expect(store.has("post:hello-world:status=published,draft")).toBe(false);
    expect(store.has("content:posts:{\"page\":1}")).toBe(false);
    expect(store.has("content:settings:{}")).toBe(true);
  });

  it("deletes translation key cache for the post locale", async () => {
    const { kv, store } = createMockKv([
      "post:tk:hello-world:locale=pt-br:status=published",
      "post:tk:hello-world:locale=en:status=published",
    ]);
    vi.mocked(getKvFromLocals).mockReturnValue(kv);

    const select = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ locale_code: "pt-br" }]),
        }),
      }),
    });
    const mockDbWithLocales = { select } as unknown as Database;

    await invalidatePostCache(locals, mockDbWithLocales, {
      id: 10,
      slug: "ola-mundo",
      status: "published",
      meta_values: JSON.stringify({ translation_key: "hello-world" }),
      id_locale_code: 1,
      post_type_id: 1,
    });

    expect(store.has("post:tk:hello-world:locale=pt-br:status=published")).toBe(false);
    expect(store.has("post:tk:hello-world:locale=en:status=published")).toBe(true);
  });
});
