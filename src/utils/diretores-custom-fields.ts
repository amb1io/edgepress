/**
 * Custom fields do admin → meta_values legados (farramedia) para posts da categoria diretores.
 */
import { and, eq } from "drizzle-orm";
import { posts, postsTaxonomies, taxonomies } from "../db/schema.ts";
import type { Database } from "./types/database.ts";
import type { CustomFieldBlockInput, CustomFieldRowInput } from "./jobs-custom-fields.ts";

export const DIRETORES_BLOCK_TITLES = {
  socialMedia: "Redes Sociais",
  reel: "Reel",
  image: "Imagem",
  slug: "Slug canônico",
} as const;

const DIRETORES_BLOCK_TITLE_SET = new Set(
  Object.values(DIRETORES_BLOCK_TITLES).map((title) => title.toLowerCase()),
);

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

function firstRowValue(rows: CustomFieldRowInput[] | undefined): string | null {
  const row = activeRows(rows).find((item) => (item.value ?? "").trim());
  return row?.value?.trim() ?? null;
}

/** Post vinculado à categoria taxonomy `diretores`. */
export async function postHasDiretoresCategory(
  db: Database,
  postId: number,
): Promise<boolean> {
  const rows = await db
    .select({ id: taxonomies.id })
    .from(postsTaxonomies)
    .innerJoin(taxonomies, eq(postsTaxonomies.term_id, taxonomies.id))
    .where(
      and(
        eq(postsTaxonomies.post_id, postId),
        eq(taxonomies.slug, "diretores"),
        eq(taxonomies.type, "category"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Converte blocos de custom fields em meta_values legados do diretor. */
export function diretoresMetaFromCustomFields(
  blocks: CustomFieldBlockInput[],
): Record<string, unknown> {
  const meta: Record<string, unknown> = {};

  for (const block of blocks) {
    const title = (block.title ?? "").trim();
    const rows = block.rows ?? [];

    if (title === DIRETORES_BLOCK_TITLES.socialMedia) {
      const urls = collectUrls(rows);
      if (urls != null) {
        meta.socialMedia = Array.isArray(urls) ? urls : [urls];
      }
      continue;
    }
    if (title === DIRETORES_BLOCK_TITLES.reel) {
      const reel = firstRowValue(rows);
      if (reel) meta.reel = reel;
      continue;
    }
    if (title === DIRETORES_BLOCK_TITLES.image) {
      const image = firstRowValue(rows);
      if (image) meta.image = image;
      continue;
    }
    if (title === DIRETORES_BLOCK_TITLES.slug) {
      const slug = firstRowValue(rows);
      if (slug) meta.slug = slug;
    }
  }

  return meta;
}

/** Converte meta_values legado em blocos de custom fields (migração / hidratação no admin). */
export function customFieldBlocksFromDiretoresMeta(
  meta: Record<string, unknown>,
): Array<{ title: string; fields: Array<{ name: string; value: string; type: string }> }> {
  const blocks: Array<{
    title: string;
    fields: Array<{ name: string; value: string; type: string }>;
  }> = [];

  const socialMedia = meta.socialMedia;
  if (socialMedia != null && socialMedia !== "") {
    const list = Array.isArray(socialMedia) ? socialMedia : [socialMedia];
    blocks.push({
      title: DIRETORES_BLOCK_TITLES.socialMedia,
      fields: [{ name: "URLs (JSON)", value: JSON.stringify(list.map(String)), type: "editor" }],
    });
  }

  const reelSource = meta.reel ?? meta.videos;
  if (reelSource != null && reelSource !== "") {
    blocks.push({
      title: DIRETORES_BLOCK_TITLES.reel,
      fields: [{ name: "URL ou ID", value: String(reelSource), type: "text" }],
    });
  }

  if (meta.image != null && meta.image !== "") {
    blocks.push({
      title: DIRETORES_BLOCK_TITLES.image,
      fields: [{ name: "URL", value: String(meta.image), type: "text" }],
    });
  }

  if (meta.slug != null && String(meta.slug).trim() !== "") {
    blocks.push({
      title: DIRETORES_BLOCK_TITLES.slug,
      fields: [{ name: "Slug", value: String(meta.slug), type: "text" }],
    });
  }

  return blocks;
}

export type DiretoresInitialCustomFieldItem = {
  id: number;
  title: string;
  rows: Array<{ id: number; name: string; value: string; type?: string }>;
  template?: boolean;
};

/** Preenche blocos ausentes no formulário a partir do meta_values (sem sobrescrever blocos existentes). */
export function mergeDiretoresCustomFieldsFromMeta<T extends DiretoresInitialCustomFieldItem>(
  existing: T[],
  meta: Record<string, unknown>,
): T[] {
  const fromMeta = customFieldBlocksFromDiretoresMeta(meta);
  if (fromMeta.length === 0) return existing;

  const existingTitles = new Set(
    existing.map((item) => (item.title ?? "").trim().toLowerCase()),
  );
  const merged = [...existing];
  let rowIdCounter = Date.now();

  for (const block of fromMeta) {
    const normalizedTitle = block.title.trim().toLowerCase();
    if (existingTitles.has(normalizedTitle)) continue;
    existingTitles.add(normalizedTitle);
    rowIdCounter += 1;
    merged.push({
      id: -rowIdCounter,
      title: block.title,
      rows: block.fields.map((field, index) => {
        rowIdCounter += 1;
        return {
          id: rowIdCounter + index,
          name: field.name,
          value: field.value,
          type: field.type === "editor" ? "editor" : "text",
        };
      }),
      template: false,
    } as T);
  }

  return merged;
}

/** Mescla meta legado do diretor a partir dos blocos salvos no admin. */
export async function applyDiretoresCustomFieldsToMeta(
  db: Database,
  postId: number,
  postTypeId: number,
  blocks: CustomFieldBlockInput[],
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

  const patch = diretoresMetaFromCustomFields(blocks);
  const merged = { ...current, ...patch };

  await db
    .update(posts)
    .set({ meta_values: JSON.stringify(merged) })
    .where(and(eq(posts.id, postId), eq(posts.post_type_id, postTypeId)));
}

export function isDiretoresManagedCustomFieldTitle(title: string): boolean {
  return DIRETORES_BLOCK_TITLE_SET.has(title.trim().toLowerCase());
}
