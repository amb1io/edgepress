import type { KVLike } from "./content-cache.ts";
import type { CustomFieldItem } from "./content-post-payload.ts";

export function buildCustomFieldsCacheKey(postId: number): string {
  return `post:customfields:${postId}`;
}

export async function getCustomFieldsFromCache(
  kv: KVLike | null | undefined,
  postId: number,
): Promise<CustomFieldItem[] | null> {
  if (!kv) return null;
  try {
    const cached = (await kv.get(buildCustomFieldsCacheKey(postId), "json")) as unknown;
    if (!Array.isArray(cached)) return null;
    return cached as CustomFieldItem[];
  } catch {
    return null;
  }
}

export async function putCustomFieldsCache(
  kv: KVLike | null | undefined,
  postId: number,
  fields: CustomFieldItem[],
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(buildCustomFieldsCacheKey(postId), JSON.stringify(fields));
  } catch {
    // ignora falha de KV
  }
}

export async function deleteCustomFieldsCache(
  kv: KVLike | null | undefined,
  postId: number,
): Promise<void> {
  if (!kv?.delete) return;
  try {
    await kv.delete(buildCustomFieldsCacheKey(postId));
  } catch {
    // ignora falha de KV
  }
}
