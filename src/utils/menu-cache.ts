import type { KVLike } from "./content-cache.ts";
import type { MenuItemPublicRaw } from "../core/services/menu-items-service.ts";

export function buildMenuCacheKey(dbLocale: string): string {
  const locale = dbLocale.trim() || "_";
  return `menu:${locale}`;
}

export async function getMenusFromCache(
  kv: KVLike | null | undefined,
  key: string,
): Promise<Record<string, MenuItemPublicRaw[]> | null> {
  if (!kv) return null;
  try {
    const cached = (await kv.get(key, "json")) as unknown;
    if (!cached || typeof cached !== "object" || Array.isArray(cached)) return null;
    return cached as Record<string, MenuItemPublicRaw[]>;
  } catch {
    return null;
  }
}

export async function putMenusCache(
  kv: KVLike | null | undefined,
  key: string,
  menus: Record<string, MenuItemPublicRaw[]>,
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(menus));
  } catch {
    // ignora falha de KV
  }
}
