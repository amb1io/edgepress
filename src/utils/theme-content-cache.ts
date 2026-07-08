import type { KVLike } from "./content-cache.ts";

export const THEME_CONTENT_CACHE_PREFIX = "theme-content:";

export function buildThemeContentCacheKey(
  resource: string,
  params: Record<string, string>,
): string {
  const normalized = Object.keys(params)
    .sort()
    .map((k) => [k, params[k]])
    .filter(([, v]) => v != null && String(v).trim() !== "");
  return `${THEME_CONTENT_CACHE_PREFIX}${resource}:${JSON.stringify(normalized)}`;
}

export async function getThemeContentFromCache(
  kv: KVLike | null | undefined,
  key: string,
): Promise<unknown | null> {
  if (!kv) return null;
  try {
    const cached = await kv.get(key, "json");
    if (cached == null) return null;
    return cached;
  } catch {
    return null;
  }
}

export async function putThemeContentCache(
  kv: KVLike | null | undefined,
  key: string,
  value: unknown,
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(value));
  } catch {
    // ignora
  }
}
