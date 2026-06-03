/**
 * Lista chaves do binding CACHE com prévia do valor (admin / API).
 */
import type { App } from "../env.d.ts";

export type KvListEntry = { key: string; valuePreview: string };

const MAX_KEYS = 500;
const VALUE_PREVIEW_LENGTH = 200;

export type ListKvCacheEntriesResult =
  | { ok: true; items: KvListEntry[] }
  | { ok: false; message: string };

export async function listKvCacheEntries(kv: App.KVLike | null): Promise<ListKvCacheEntriesResult> {
  if (!kv || typeof kv.list !== "function") {
    return { ok: false, message: "KV (CACHE) not configured" };
  }

  try {
    const items: KvListEntry[] = [];
    let cursor: string | undefined;
    let total = 0;

    do {
      const result = await kv.list({ limit: 100, ...(cursor !== undefined && { cursor }) });
      for (const { name } of result.keys) {
        if (total >= MAX_KEYS) break;
        let valuePreview = "—";
        try {
          const raw = await kv.get(name, "text");
          if (raw != null && typeof raw === "string") {
            valuePreview =
              raw.length <= VALUE_PREVIEW_LENGTH
                ? raw
                : raw.slice(0, VALUE_PREVIEW_LENGTH) + "…";
          }
        } catch {
          valuePreview = "(erro ao ler)";
        }
        items.push({ key: name, valuePreview });
        total++;
      }
      cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor && total < MAX_KEYS);

    return { ok: true, items };
  } catch (err) {
    const message = err instanceof Error ? err.message : "KV error";
    return { ok: false, message };
  }
}
