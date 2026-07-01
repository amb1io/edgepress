import type { KVLike } from "./content-cache.ts";

export type RelatedPostsCacheKeyInput = {
  postId: number;
  localeCode: string;
  limit: number;
  status?: string;
};

export function buildRelatedPostsCacheKey(input: RelatedPostsCacheKeyInput): string {
  const status = (input.status ?? "published").trim() || "published";
  const locale = input.localeCode.trim() || "_";
  const limit = Math.max(1, input.limit);
  return `related:post:id:${input.postId}:locale=${locale}:limit=${limit}:status=${status}`;
}

export function normalizeRelatedPostsLimit(limit?: number): number {
  const n = limit ?? 4;
  if (!Number.isFinite(n) || n < 1) return 4;
  return Math.floor(n);
}

export async function getRelatedPostsFromCache(
  kv: KVLike | null | undefined,
  key: string,
): Promise<number[] | null> {
  if (!kv) return null;
  try {
    const cached = (await kv.get(key, "json")) as unknown;
    if (!Array.isArray(cached)) return null;
    const ids = cached
      .map((value) => Number(value))
      .filter((id) => Number.isFinite(id) && id > 0);
    return ids;
  } catch {
    return null;
  }
}

export async function putRelatedPostsCache(
  kv: KVLike | null | undefined,
  key: string,
  postIds: number[],
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(postIds));
  } catch {
    // ignora falha de KV
  }
}

/** In-memory store for CLI dev preview (mirrors KV behavior). */
export type RelatedPostsCacheStore = {
  get(key: string): number[] | null;
  set(key: string, postIds: number[]): void;
};

export function createMemoryRelatedPostsCacheStore(): RelatedPostsCacheStore {
  const store = new Map<string, number[]>();
  return {
    get(key) {
      return store.get(key) ?? null;
    },
    set(key, postIds) {
      store.set(key, postIds);
    },
  };
}
