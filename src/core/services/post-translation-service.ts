/**
 * Resolução de posts por chave lógica de tradução (solução C).
 *
 * Convenção:
 * - `meta_values.translation_key`: mesma chave em todas as versões (ex.: hello-world)
 * - `id_locale_code`: idioma da versão
 * - `parent_id` (opcional): aponta para o post canônico / idioma principal
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../../utils/types/database.ts";
import { db as defaultDb } from "../../db/index.ts";
import { locales, posts } from "../../db/schema.ts";
import type { PostRow } from "../../utils/content-post-payload.ts";
import { isValidSlug } from "../../utils/validation.ts";

export const TRANSLATION_KEY_META = "translation_key";

const POST_SELECT = {
  id: posts.id,
  post_type_id: posts.post_type_id,
  parent_id: posts.parent_id,
  author_id: posts.author_id,
  id_locale_code: posts.id_locale_code,
  title: posts.title,
  slug: posts.slug,
  excerpt: posts.excerpt,
  body: posts.body,
  body_blocks: posts.body_blocks,
  status: posts.status,
  meta_values: posts.meta_values,
  published_at: posts.published_at,
  created_at: posts.created_at,
  updated_at: posts.updated_at,
} as const;

export function normalizeTranslationKey(raw: string | null | undefined): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (!isValidSlug(v)) return null;
  return v;
}

/** Resolve código de locale (pt-br, en, es_ES) para id em `locales`. */
export async function resolveLocaleId(
  localeCode: string | null | undefined,
  database: Database = defaultDb,
): Promise<number | null> {
  const trimmed = String(localeCode ?? "").trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase().replace(/-/g, "_");
  const candidates = [
    trimmed,
    normalized,
    normalized.replace(/_/g, "-"),
    normalized === "pt_br" ? "pt-br" : null,
    normalized === "en_us" ? "en" : null,
    normalized === "es_es" ? "es" : null,
  ].filter((c): c is string => Boolean(c));

  for (const code of candidates) {
    const [row] = await database
      .select({ id: locales.id })
      .from(locales)
      .where(eq(locales.locale_code, code))
      .limit(1);
    if (row) return row.id;

    const underscored = code.toLowerCase().replace(/-/g, "_");
    const [row2] = await database
      .select({ id: locales.id })
      .from(locales)
      .where(eq(locales.locale_code, underscored))
      .limit(1);
    if (row2) return row2.id;
  }

  return null;
}

function translationKeyMatch(key: string) {
  return sql`json_extract(${posts.meta_values}, '$.translation_key') = ${key}`;
}

function statusWhere(statusList: string[]) {
  if (statusList.length === 1) {
    return eq(posts.status, statusList[0] as typeof posts.$inferSelect.status);
  }
  return inArray(posts.status, statusList as typeof posts.$inferSelect.status[]);
}

async function fetchPostRow(
  database: Database,
  where: ReturnType<typeof and>,
): Promise<PostRow | null> {
  const [row] = await database
    .select(POST_SELECT)
    .from(posts)
    .where(where)
    .limit(1);
  return row ?? null;
}

/**
 * Busca post pela chave de tradução + locale.
 * Ordem: meta translation_key + locale → filho do canônico (parent_id) + locale → slug + locale.
 */
export async function findPostByTranslationKey(
  translationKey: string,
  localeCode: string | null | undefined,
  statusList: string[],
  database: Database = defaultDb,
): Promise<PostRow | null> {
  const key = normalizeTranslationKey(translationKey);
  if (!key) return null;

  const localeId = await resolveLocaleId(localeCode, database);
  const statusCond = statusWhere(statusList);

  // 1) translation_key no meta + id_locale_code
  if (localeId != null) {
    const direct = await fetchPostRow(
      database,
      and(translationKeyMatch(key), eq(posts.id_locale_code, localeId), statusCond),
    );
    if (direct) return direct;

    // 2) canônico (sem parent) com a chave → filho com parent_id + locale
    const roots = await database
      .select({ id: posts.id, id_locale_code: posts.id_locale_code })
      .from(posts)
      .where(and(translationKeyMatch(key), isNull(posts.parent_id), statusCond));

    for (const root of roots) {
      if (root.id_locale_code === localeId) {
        const rootPost = await fetchPostRow(database, and(eq(posts.id, root.id), statusCond));
        if (rootPost) return rootPost;
      }
      const child = await fetchPostRow(
        database,
        and(
          eq(posts.parent_id, root.id),
          eq(posts.id_locale_code, localeId),
          statusCond,
        ),
      );
      if (child) return child;
    }

    // 2b) qualquer post com a chave como “âncora” e filhos por parent_id
    if (roots.length === 0) {
      const anchors = await database
        .select({ id: posts.id })
        .from(posts)
        .where(and(translationKeyMatch(key), statusCond))
        .limit(20);

      for (const anchor of anchors) {
        const self = await fetchPostRow(
          database,
          and(eq(posts.id, anchor.id), eq(posts.id_locale_code, localeId), statusCond),
        );
        if (self) return self;

        const child = await fetchPostRow(
          database,
          and(
            eq(posts.parent_id, anchor.id),
            eq(posts.id_locale_code, localeId),
            statusCond,
          ),
        );
        if (child) return child;
      }
    }

    // 3) slug localizado + locale (compat.)
    const bySlug = await fetchPostRow(
      database,
      and(eq(posts.slug, key), eq(posts.id_locale_code, localeId), statusCond),
    );
    if (bySlug) return bySlug;
  }

  // Sem locale: primeira publicação com a chave (fallback)
  const any = await fetchPostRow(database, and(translationKeyMatch(key), statusCond));
  return any;
}

export function buildTranslationPostCacheKey(
  translationKey: string,
  localeCode: string | null | undefined,
  statusKey: string,
): string {
  const loc = String(localeCode ?? "").trim().toLowerCase() || "_";
  return `post:tk:${translationKey}:locale=${loc}:status=${statusKey}`;
}
