import { eq } from "drizzle-orm";
import { seoMetadata } from "../../db/schema.ts";
import type { Database } from "../../shared/types/database.ts";

export type SeoFieldValues = {
  seo_title: string;
  seo_description: string;
  seo_canonical: string;
};

export type SeoPostContext = {
  title: string;
  excerpt: string;
  slug: string;
};

export type CustomFieldRowInput = {
  name?: string;
  value?: string;
  type?: string;
};

export type CustomFieldItemInput = {
  title?: string;
  rows?: CustomFieldRowInput[];
};

export type SeoApiPayload = {
  title: string;
  description: string;
  canonical_slug: string;
  canonical: string;
};

const SEO_BLOCK_TITLE = "seo";

const ROW_NAME_MAP: Record<string, keyof SeoFieldValues> = {
  "título seo": "seo_title",
  "titulo seo": "seo_title",
  seo_title: "seo_title",
  "descrição seo": "seo_description",
  "descricao seo": "seo_description",
  seo_description: "seo_description",
  "url canônica": "seo_canonical",
  "url canonica": "seo_canonical",
  seo_canonical: "seo_canonical",
};

function normalizeRowName(name: string): string {
  return name.trim().toLowerCase();
}

function emptySeoValues(): SeoFieldValues {
  return { seo_title: "", seo_description: "", seo_canonical: "" };
}

/**
 * Extrai valores SEO do bloco custom field com título "SEO".
 */
export function extractSeoFromCustomFields(
  items: CustomFieldItemInput[] | null | undefined,
): SeoFieldValues {
  const result = emptySeoValues();
  if (!Array.isArray(items) || items.length === 0) return result;

  const seoBlock = items.find(
    (item) => (item.title ?? "").trim().toLowerCase() === SEO_BLOCK_TITLE,
  );
  if (!seoBlock?.rows?.length) return result;

  for (const row of seoBlock.rows) {
    const key = ROW_NAME_MAP[normalizeRowName(row.name ?? "")];
    if (key) {
      result[key] = String(row.value ?? "").trim();
    }
  }
  return result;
}

/**
 * Aplica fallbacks do post quando campos SEO estão vazios.
 */
export function resolveSeoValues(
  raw: SeoFieldValues,
  post: SeoPostContext,
): SeoFieldValues {
  return {
    seo_title: raw.seo_title.trim() || post.title.trim(),
    seo_description: raw.seo_description.trim() || post.excerpt.trim(),
    seo_canonical: raw.seo_canonical.trim() || post.slug.trim(),
  };
}

/**
 * Resolve URL canônica absoluta. Valores já absolutos são preservados;
 * caso contrário, monta a partir de baseUrl + slug/path.
 */
export function resolveCanonicalUrl(
  canonical: string,
  baseUrl: string | undefined,
  postSlug: string,
): string {
  const value = canonical.trim();
  if (!value) {
    if (!baseUrl) return postSlug;
    return joinUrl(baseUrl, postSlug);
  }
  if (/^https?:\/\//i.test(value)) return value;
  if (!baseUrl) return value.startsWith("/") ? value : `/${value}`;
  const path = value.startsWith("/") ? value : `/${value}`;
  return joinUrl(baseUrl, path);
}

function joinUrl(base: string, path: string): string {
  const baseClean = base.replace(/\/$/, "");
  const pathClean = path.startsWith("/") ? path : `/${path}`;
  return `${baseClean}${pathClean}`;
}

/**
 * Monta objeto `seo` para resposta da API de conteúdo.
 */
export function buildSeoApiPayload(
  row: SeoFieldValues | null | undefined,
  baseUrl?: string,
  postSlug?: string,
): SeoApiPayload | null {
  if (!row) return null;
  const slug = postSlug ?? row.seo_canonical;
  return {
    title: row.seo_title,
    description: row.seo_description,
    canonical_slug: row.seo_canonical,
    canonical: resolveCanonicalUrl(row.seo_canonical, baseUrl, slug),
  };
}

export async function getSeoMetadataForPost(
  db: Database,
  postId: number,
): Promise<SeoFieldValues | null> {
  const [row] = await db
    .select({
      seo_title: seoMetadata.seo_title,
      seo_description: seoMetadata.seo_description,
      seo_canonical: seoMetadata.seo_canonical,
    })
    .from(seoMetadata)
    .where(eq(seoMetadata.post_id, postId))
    .limit(1);

  if (!row) return null;
  return {
    seo_title: row.seo_title ?? "",
    seo_description: row.seo_description ?? "",
    seo_canonical: row.seo_canonical ?? "",
  };
}

export function customFieldPostsToItems(
  posts: Array<{ title: string | null; meta_values: string | null }>,
): CustomFieldItemInput[] {
  return posts.map((p) => {
    let rows: CustomFieldRowInput[] = [];
    if (p.meta_values) {
      try {
        const meta = JSON.parse(p.meta_values) as { fields?: CustomFieldRowInput[] };
        if (Array.isArray(meta.fields)) {
          rows = meta.fields.map((f) => ({
            name: f.name,
            value: f.value,
            type: f.type,
          }));
        }
      } catch {
        // ignore invalid JSON
      }
    }
    return { title: p.title ?? "", rows };
  });
}

export async function syncSeoMetadataFromPostSave(
  db: Database,
  postId: number,
  post: SeoPostContext,
  customFieldsDataRaw: string,
): Promise<void> {
  let items: CustomFieldItemInput[] = [];
  if (customFieldsDataRaw.trim() !== "") {
    try {
      const parsed = JSON.parse(customFieldsDataRaw) as CustomFieldItemInput[];
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      // ignore parse errors
    }
  }
  const raw = extractSeoFromCustomFields(items);
  const resolved = resolveSeoValues(raw, post);
  await upsertSeoMetadata(db, postId, resolved);
}

export async function upsertSeoMetadata(
  db: Database,
  postId: number,
  values: SeoFieldValues,
): Promise<void> {
  const now = Date.now();
  const [existing] = await db
    .select({ id: seoMetadata.id })
    .from(seoMetadata)
    .where(eq(seoMetadata.post_id, postId))
    .limit(1);

  if (existing) {
    await db
      .update(seoMetadata)
      .set({
        seo_title: values.seo_title,
        seo_description: values.seo_description,
        seo_canonical: values.seo_canonical,
        updated_at: now,
      })
      .where(eq(seoMetadata.post_id, postId));
    return;
  }

  await db.insert(seoMetadata).values({
    post_id: postId,
    seo_title: values.seo_title,
    seo_description: values.seo_description,
    seo_canonical: values.seo_canonical,
    created_at: now,
    updated_at: now,
  });
}

/** Rows padrão do bloco SEO no admin (criação de post/page). */
export function buildDefaultSeoCustomFieldRows(): Array<{
  id: number;
  name: string;
  value: string;
  type: string;
}> {
  return [
    { id: -1, name: "Título SEO", value: "", type: "text" },
    { id: -2, name: "Descrição SEO", value: "", type: "text" },
    { id: -3, name: "URL Canônica", value: "", type: "text" },
  ];
}

/** Bloco SEO inicial para formulário new de post/page. */
export function buildDefaultSeoCustomFieldBlock(): {
  id: number;
  title: string;
  rows: Array<{ id: number; name: string; value: string; type: string }>;
  template: boolean;
} {
  return {
    id: -1,
    title: "SEO",
    rows: buildDefaultSeoCustomFieldRows(),
    template: false,
  };
}
