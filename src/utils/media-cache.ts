import type { KVLike } from "./content-cache.ts";
import type { Media } from "../shared/types/media.ts";

export const MEDIA_ID_CACHE_PREFIX = "media:id:";
export const MEDIA_LIST_CACHE_PREFIX = "media:list:";

export function buildMediaIdCacheKey(mediaId: number): string {
  return `${MEDIA_ID_CACHE_PREFIX}${mediaId}`;
}

export function buildMediaListCacheKey(limit: number, search?: string): string {
  const term = (search ?? "").trim().toLowerCase();
  return `${MEDIA_LIST_CACHE_PREFIX}limit=${limit}:search=${term}`;
}

export async function getMediaFromCache(
  kv: KVLike | null | undefined,
  mediaId: number,
): Promise<Media | null | undefined> {
  if (!kv) return undefined;
  try {
    const cached = (await kv.get(buildMediaIdCacheKey(mediaId), "json")) as unknown;
    // Negative lookups were cached as null in older versions; treat as miss and re-query D1.
    if (cached === null) return undefined;
    if (!cached || typeof cached !== "object") return undefined;
    return cached as Media;
  } catch {
    return undefined;
  }
}

export async function putMediaCache(
  kv: KVLike | null | undefined,
  mediaId: number,
  media: Media | null,
): Promise<void> {
  if (!kv || media == null) return;
  try {
    await kv.put(buildMediaIdCacheKey(mediaId), JSON.stringify(media));
  } catch {
    // ignora falha de KV
  }
}

export async function getMediaListFromCache(
  kv: KVLike | null | undefined,
  key: string,
): Promise<Media[] | null> {
  if (!kv) return null;
  try {
    const cached = (await kv.get(key, "json")) as unknown;
    if (!Array.isArray(cached)) return null;
    return cached as Media[];
  } catch {
    return null;
  }
}

export async function putMediaListCache(
  kv: KVLike | null | undefined,
  key: string,
  list: Media[],
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(list));
  } catch {
    // ignora falha de KV
  }
}
