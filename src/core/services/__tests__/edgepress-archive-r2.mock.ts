import { vi } from "vitest";

type StoredObject = {
  data: Uint8Array;
  contentType?: string;
};

export function createMockR2Bucket(initial: Record<string, StoredObject> = {}) {
  const store = new Map<string, StoredObject>(Object.entries(initial));

  return {
    store,
    list: vi.fn(
      async (options?: { prefix?: string; cursor?: string; limit?: number }) => {
        const prefix = options?.prefix ?? "";
        const keys = [...store.keys()]
          .filter((key) => key.startsWith(prefix))
          .sort();
        return {
          objects: keys.map((key) => ({ key })),
          truncated: false as const,
        };
      },
    ),
    get: vi.fn(async (key: string) => {
      const item = store.get(key);
      if (!item) return null;
      return {
        body: new Blob([item.data]).stream(),
        httpMetadata: { contentType: item.contentType },
      };
    }),
    put: vi.fn(
      async (
        key: string,
        value: BodyInit,
        options?: { httpMetadata?: { contentType?: string } },
      ) => {
        const data =
          value instanceof Uint8Array
            ? value
            : new Uint8Array(await new Response(value).arrayBuffer());
        store.set(key, {
          data,
          contentType: options?.httpMetadata?.contentType,
        });
      },
    ),
    delete: vi.fn(async (keys: string | string[]) => {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) store.delete(key);
    }),
  };
}
