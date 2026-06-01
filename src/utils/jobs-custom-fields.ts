/**
 * Mapeia blocos de custom fields do post type jobs para meta_values legados (farramedia).
 */
import { and, eq } from "drizzle-orm";
import { posts } from "../db/schema.ts";
import type { Database } from "./types/database.ts";
export type CustomFieldRowInput = {
  name?: string;
  value?: string;
  type?: string;
  _deleted?: boolean;
};

export type CustomFieldBlockInput = {
  title: string;
  rows?: CustomFieldRowInput[];
};

export const JOBS_BLOCK_TITLES = {
  videos: "Vídeos",
  videosHome: "Vídeos Home",
  videosHomeOrder: "Ordem Vídeos Home",
  fichaTecnica: "Ficha Técnica",
  socialMedia: "Redes Sociais",
  reel: "Reel",
  images: "Imagens",
} as const;

function activeRows(rows: CustomFieldRowInput[] | undefined): CustomFieldRowInput[] {
  return (rows ?? []).filter((row) => !row._deleted);
}

function parseJsonValue<T>(raw: string | undefined, fallback: T): T {
  if (!raw?.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function collectUrls(rows: CustomFieldRowInput[]): string | string[] | null {
  const urls: string[] = [];
  for (const row of activeRows(rows)) {
    const name = (row.name ?? "").trim().toLowerCase();
    const value = (row.value ?? "").trim();
    if (!value) continue;
    if (name.includes("json") || row.type === "editor") {
      const parsed = parseJsonValue<string[]>(value, []);
      if (Array.isArray(parsed)) {
        urls.push(...parsed.filter((v) => typeof v === "string" && v.trim()));
      }
      continue;
    }
    urls.push(value);
  }
  if (urls.length === 0) return null;
  return urls.length === 1 ? urls[0] : urls;
}

function collectFichaTecnica(rows: CustomFieldRowInput[]): Array<{ title: string; content: string }> | null {
  const items = activeRows(rows)
    .map((row) => ({
      title: (row.name ?? "").trim(),
      content: (row.value ?? "").trim(),
    }))
    .filter((row) => row.title || row.content);
  return items.length > 0 ? items : null;
}

/** Converte blocos de custom fields em chaves legadas do meta_values do job. */
export function jobsMetaFromCustomFields(
  blocks: CustomFieldBlockInput[]
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};

  for (const block of blocks) {
    const title = (block.title ?? "").trim();
    const rows = block.rows ?? [];

    if (title === JOBS_BLOCK_TITLES.videos) {
      const videos = collectUrls(rows);
      if (videos != null) meta.videos = videos;
      continue;
    }
    if (title === JOBS_BLOCK_TITLES.videosHome) {
      const urls = collectUrls(rows);
      if (urls != null) {
        meta.videosHome = Array.isArray(urls) ? urls : [urls];
      }
      continue;
    }
    if (title === JOBS_BLOCK_TITLES.videosHomeOrder) {
      const orderRow = activeRows(rows).find((row) => (row.value ?? "").trim());
      if (orderRow?.value != null) {
        const parsed = Number.parseInt(orderRow.value, 10);
        meta.videosHomeOrder = Number.isNaN(parsed) ? orderRow.value : parsed;
      }
      continue;
    }
    if (title === JOBS_BLOCK_TITLES.fichaTecnica) {
      const ficha = collectFichaTecnica(rows);
      if (ficha) meta.fichaTecnica = ficha;
      continue;
    }
    if (title === JOBS_BLOCK_TITLES.socialMedia) {
      const urls = collectUrls(rows);
      if (urls != null) {
        meta.socialMedia = Array.isArray(urls) ? urls : [urls];
      }
      continue;
    }
    if (title === JOBS_BLOCK_TITLES.reel) {
      const reelRow = activeRows(rows).find((row) => (row.value ?? "").trim());
      if (reelRow?.value) meta.reel = reelRow.value.trim();
      continue;
    }
    if (title === JOBS_BLOCK_TITLES.images) {
      const urls = collectUrls(rows);
      if (urls != null) {
        meta.images = Array.isArray(urls) ? JSON.stringify(urls) : JSON.stringify([urls]);
      }
    }
  }

  return meta;
}

/** Converte meta_values legado do job em blocos de custom fields (migração / seed). */
export function customFieldBlocksFromJobsMeta(
  meta: Record<string, unknown>
): Array<{ title: string; fields: Array<{ name: string; value: string; type: string }> }> {
  const blocks: Array<{ title: string; fields: Array<{ name: string; value: string; type: string }> }> = [];

  const videos = meta.videos;
  if (videos != null && videos !== "") {
    if (Array.isArray(videos)) {
      const [first, ...rest] = videos.map(String);
      const fields = [{ name: "URL", value: first ?? "", type: "text" }];
      if (rest.length > 0) {
        fields.push({ name: "URLs adicionais (JSON)", value: JSON.stringify(rest), type: "editor" });
      }
      blocks.push({ title: JOBS_BLOCK_TITLES.videos, fields });
    } else {
      blocks.push({
        title: JOBS_BLOCK_TITLES.videos,
        fields: [{ name: "URL", value: String(videos), type: "text" }],
      });
    }
  }

  const videosHome = meta.videosHome;
  if (videosHome != null && videosHome !== "") {
    const list = Array.isArray(videosHome) ? videosHome : [videosHome];
    blocks.push({
      title: JOBS_BLOCK_TITLES.videosHome,
      fields: [{ name: "URLs (JSON)", value: JSON.stringify(list.map(String)), type: "editor" }],
    });
  }

  if (meta.videosHomeOrder != null && meta.videosHomeOrder !== "") {
    blocks.push({
      title: JOBS_BLOCK_TITLES.videosHomeOrder,
      fields: [{ name: "Ordem", value: String(meta.videosHomeOrder), type: "text" }],
    });
  }

  let ficha = meta.fichaTecnica;
  if (typeof ficha === "string") {
    ficha = parseJsonValue<Array<{ title?: string; content?: string }>>(ficha, []);
  }
  if (Array.isArray(ficha) && ficha.length > 0) {
    blocks.push({
      title: JOBS_BLOCK_TITLES.fichaTecnica,
      fields: ficha.map((item) => ({
        name: String(item?.title ?? ""),
        value: String(item?.content ?? ""),
        type: "text",
      })),
    });
  }

  const socialMedia = meta.socialMedia;
  if (socialMedia != null && socialMedia !== "") {
    const list = Array.isArray(socialMedia) ? socialMedia : [socialMedia];
    blocks.push({
      title: JOBS_BLOCK_TITLES.socialMedia,
      fields: [{ name: "URLs (JSON)", value: JSON.stringify(list.map(String)), type: "editor" }],
    });
  }

  if (meta.reel != null && meta.reel !== "") {
    blocks.push({
      title: JOBS_BLOCK_TITLES.reel,
      fields: [{ name: "URL", value: String(meta.reel), type: "text" }],
    });
  }

  let images = meta.images;
  if (typeof images === "string" && images.trim().startsWith("[")) {
    images = parseJsonValue<string[]>(images, []);
  }
  if (Array.isArray(images) && images.length > 0) {
    blocks.push({
      title: JOBS_BLOCK_TITLES.images,
      fields: [{ name: "URLs (JSON)", value: JSON.stringify(images.map(String)), type: "editor" }],
    });
  }

  return blocks;
}

/** Mescla meta legado do job a partir dos blocos salvos no admin. */
export async function applyJobsCustomFieldsToMeta(
  db: Database,
  postId: number,
  postTypeId: number,
  blocks: CustomFieldBlockInput[]
): Promise<void> {
  const [existing] = await db
    .select({ meta_values: posts.meta_values })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.post_type_id, postTypeId)))
    .limit(1);

  let current: Record<string, unknown> = {};
  if (existing?.meta_values) {
    try {
      current = JSON.parse(existing.meta_values) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }

  const patch = jobsMetaFromCustomFields(blocks);
  const merged = { ...current, ...patch };

  await db
    .update(posts)
    .set({ meta_values: JSON.stringify(merged) })
    .where(and(eq(posts.id, postId), eq(posts.post_type_id, postTypeId)));
}
