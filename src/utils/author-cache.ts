import type { KVLike } from "./content-cache.ts";
import type { ThemeAuthorView } from "../core/theme/types.ts";

export function buildAuthorCacheKey(userId: string): string {
  const id = userId.trim();
  return `author:user:${id}`;
}

export async function getAuthorFromCache(
  kv: KVLike | null | undefined,
  key: string,
): Promise<ThemeAuthorView | null> {
  if (!kv) return null;
  try {
    const cached = (await kv.get(key, "json")) as unknown;
    if (!cached || typeof cached !== "object") return null;
    const row = cached as Record<string, unknown>;
    return {
      name: String(row.name ?? ""),
      image: String(row.image ?? ""),
      description: String(row.description ?? ""),
    };
  } catch {
    return null;
  }
}

export async function putAuthorCache(
  kv: KVLike | null | undefined,
  key: string,
  author: ThemeAuthorView,
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(author));
  } catch {
    // ignora falha de KV
  }
}

/** In-memory store for CLI dev preview (mirrors KV behavior). */
export type AuthorCacheStore = {
  get(key: string): ThemeAuthorView | null;
  set(key: string, author: ThemeAuthorView): void;
  delete(key: string): void;
};

export function createMemoryAuthorCacheStore(): AuthorCacheStore {
  const store = new Map<string, ThemeAuthorView>();
  return {
    get(key) {
      return store.get(key) ?? null;
    },
    set(key, author) {
      store.set(key, author);
    },
    delete(key) {
      store.delete(key);
    },
  };
}
