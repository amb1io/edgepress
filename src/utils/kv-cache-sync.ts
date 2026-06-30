/**
 * Sincronização do cache KV após create/update/delete nos formulários do site.
 * - Atualiza o registro KV correspondente quando possível (ex.: post por id/slug).
 * - Invalida listas ou caches que dependem dos dados alterados (ex.: content:posts:*, settings:*, i18n:*).
 */
import type { App } from "../env.d.ts";
import { getKvFromLocals } from "./runtime-locals.ts";
import type { Database } from "./types/database.ts";
import { posts, postTypes } from "../db/schema.ts";
import { eq } from "drizzle-orm";
import { buildContentPostPayload } from "./content-post-payload.ts";
import { parseMetaValues } from "./meta-parser.ts";
import {
  buildTranslationPostCacheKey,
  normalizeTranslationKey,
  TRANSLATION_KEY_META,
} from "../core/services/post-translation-service.ts";
import { locales } from "../db/schema.ts";
import {
  getActiveThemeFromDb,
  THEME_ACTIVE_KV_KEY,
  THEME_META_KV_PREFIX,
  THEME_STATUS_KV_PREFIX,
  getThemeSnapshotById,
  parseThemeImportState,
} from "./services/theme-service.ts";
import { upsertActiveThemeSetting } from "./services/settings-service.ts";
import { ARCHIVABLE_POST_TYPES_KV_KEY } from "../core/theme/post-type-routes.ts";

/** Deleta todas as chaves com o prefixo dado. Ignora erros de KV. */
export async function deleteKvKeysByPrefix(kv: App.KVLike, prefix: string): Promise<void> {
  if (typeof kv.list !== "function" || typeof kv.delete !== "function") return;
  try {
    let cursor: string | undefined;
    do {
      const result = await kv.list({ prefix, limit: 200, ...(cursor && { cursor }) });
      for (const key of result.keys) {
        try {
          await kv.delete(key.name);
        } catch {
          // ignora falha em uma chave
        }
      }
      cursor = result.list_complete ? undefined : result.cursor;
    } while (cursor);
  } catch {
    // ignora falha de list/delete
  }
}

/**
 * Atualiza o cache KV do post após create/update: grava o payload em post:id:X e
 * post:slug:status=Y; invalida listagens content:posts:*.
 */
export async function syncPostCache(
  locals: App.Locals,
  db: Database,
  postId: number,
): Promise<void> {
  const kv = getKvFromLocals(locals);
  if (!kv) return;

  try {
    const [post] = await db
      .select({
        id: posts.id,
        post_type_id: posts.post_type_id,
        parent_id: posts.parent_id,
        author_id: posts.author_id,
        title: posts.title,
        slug: posts.slug,
        excerpt: posts.excerpt,
        body: posts.body,
        body_blocks: posts.body_blocks,
        status: posts.status,
        id_locale_code: posts.id_locale_code,
        meta_values: posts.meta_values,
        published_at: posts.published_at,
        created_at: posts.created_at,
        updated_at: posts.updated_at,
      })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!post) return;

    const payload = await buildContentPostPayload(db, post as Parameters<typeof buildContentPostPayload>[1]);
    const payloadStr = JSON.stringify(payload);

    const idKey = `post:id:${postId}`;
    const slugStatusKey = `post:${post.slug}:status=${post.status}`;
    const puts: Promise<void>[] = [
      kv.put(idKey, payloadStr),
      kv.put(slugStatusKey, payloadStr),
    ];

    const meta = parseMetaValues(post.meta_values) as Record<string, unknown>;
    const rawTk = meta[TRANSLATION_KEY_META];
    const translationKey = normalizeTranslationKey(
      typeof rawTk === "string" ? rawTk : typeof rawTk === "number" ? String(rawTk) : null,
    );
    if (translationKey) {
      let localeCode = "_";
      if (post.id_locale_code != null) {
        const [locRow] = await db
          .select({ locale_code: locales.locale_code })
          .from(locales)
          .where(eq(locales.id, post.id_locale_code))
          .limit(1);
        if (locRow?.locale_code) localeCode = locRow.locale_code;
      }
      puts.push(
        kv.put(
          buildTranslationPostCacheKey(translationKey, localeCode, post.status),
          payloadStr,
        ),
      );
    }

    await Promise.all(puts);
  } catch {
    // não falha a resposta da API por causa do cache
  }

  await invalidateContentListByTable(locals, "posts");

  // Themes exigem projeção de cache dedicada para resolver tema ativo no runtime.
  try {
    const [postRow] = await db
      .select({ post_type_id: posts.post_type_id })
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);
    if (!postRow) return;
    const [typeRow] = await db
      .select({ slug: postTypes.slug })
      .from(postTypes)
      .where(eq(postTypes.id, postRow.post_type_id))
      .limit(1);
    if (typeRow?.slug === "themes") {
      await syncThemeCache(locals, db);
    }
  } catch {
    // ignora falha de sincronização de tema
  }
}

export type PostCacheSnapshot = {
  id: number;
  slug: string;
  status: string;
  meta_values: string | null;
  id_locale_code: number | null;
  post_type_id: number;
};

/**
 * Remove do KV o cache do post após delete: post:id:X, post:slug:status=*,
 * post:tk:... (locale do post) e listagens content:posts:*.
 */
export async function invalidatePostCache(
  locals: App.Locals,
  db: Database,
  post: PostCacheSnapshot,
): Promise<void> {
  const kv = getKvFromLocals(locals);
  if (!kv) return;

  try {
    await kv.delete?.(`post:id:${post.id}`);
  } catch {
    // ignora
  }

  try {
    await deleteKvKeysByPrefix(kv, `post:${post.slug}:status=`);
  } catch {
    // ignora
  }

  try {
    const meta = parseMetaValues(post.meta_values) as Record<string, unknown>;
    const rawTk = meta[TRANSLATION_KEY_META];
    const translationKey = normalizeTranslationKey(
      typeof rawTk === "string" ? rawTk : typeof rawTk === "number" ? String(rawTk) : null,
    );
    if (translationKey) {
      let localeCode = "_";
      if (post.id_locale_code != null) {
        const [locRow] = await db
          .select({ locale_code: locales.locale_code })
          .from(locales)
          .where(eq(locales.id, post.id_locale_code))
          .limit(1);
        if (locRow?.locale_code) localeCode = locRow.locale_code;
      }
      const loc = String(localeCode ?? "").trim().toLowerCase() || "_";
      await deleteKvKeysByPrefix(kv, `post:tk:${translationKey}:locale=${loc}:status=`);
    }
  } catch {
    // ignora
  }

  await invalidateContentListByTable(locals, "posts");

  try {
    const [typeRow] = await db
      .select({ slug: postTypes.slug })
      .from(postTypes)
      .where(eq(postTypes.id, post.post_type_id))
      .limit(1);
    if (typeRow?.slug === "themes") {
      await invalidateThemeCache(locals);
    }
  } catch {
    // ignora
  }
}

/**
 * Invalida todas as chaves de listagem de uma tabela (prefixo content:table:).
 */
export async function invalidateContentListByTable(
  locals: App.Locals,
  table: string,
): Promise<void> {
  const kv = getKvFromLocals(locals);
  if (!kv) return;
  const prefix = `content:${table}:`;
  await deleteKvKeysByPrefix(kv, prefix);
}

/**
 * Invalida cache de settings (settings:autoload e settings:name1,name2,...).
 */
export async function invalidateSettingsCache(locals: App.Locals): Promise<void> {
  const kv = getKvFromLocals(locals);
  if (!kv) return;
  await deleteKvKeysByPrefix(kv, "settings:");
}

/**
 * Invalida cache de i18n. Se localeCode for informado, remove apenas i18n:localeCode; senão remove todos i18n:*.
 */
export async function invalidateI18nCache(
  locals: App.Locals,
  localeCode?: string,
): Promise<void> {
  const kv = getKvFromLocals(locals);
  if (!kv) return;
  if (localeCode) {
    try {
      await kv.delete?.(`i18n:${localeCode}`);
    } catch {
      // ignora
    }
    return;
  }
  await deleteKvKeysByPrefix(kv, "i18n:");
}

/**
 * Invalida cache de tema (tema ativo + metadados por slug).
 */
export async function invalidateThemeCache(locals: App.Locals): Promise<void> {
  const kv = getKvFromLocals(locals);
  if (!kv) return;
  try {
    await kv.delete?.(THEME_ACTIVE_KV_KEY);
  } catch {
    // ignora
  }
  await deleteKvKeysByPrefix(kv, THEME_META_KV_PREFIX);
  await deleteKvKeysByPrefix(kv, THEME_STATUS_KV_PREFIX);
}

/**
 * Recalcula e projeta em KV o tema ativo e seus metadados canônicos.
 */
export async function syncThemeCache(
  locals: App.Locals,
  db: Database,
): Promise<void> {
  const kv = getKvFromLocals(locals);
  if (!kv) return;
  try {
    const activeTheme = await getActiveThemeFromDb(db);
    await kv.put(THEME_ACTIVE_KV_KEY, JSON.stringify(activeTheme));
    if (activeTheme.meta?.theme_slug) {
      await kv.put(
        `${THEME_META_KV_PREFIX}${activeTheme.meta.theme_slug}`,
        JSON.stringify(activeTheme.meta),
      );
    }

    if (activeTheme.meta?.theme_slug) {
      await upsertActiveThemeSetting(db, activeTheme.meta.theme_slug);
    } else if (activeTheme.slug) {
      await upsertActiveThemeSetting(db, activeTheme.slug);
    }
  } catch {
    // ignora falhas de sync de tema para não impactar fluxo principal
  }
}

/**
 * Atualiza em KV o status de importação de um tema específico.
 */
export async function syncThemeStatusCacheByPostId(
  locals: App.Locals,
  db: Database,
  themePostId: number
): Promise<void> {
  const kv = getKvFromLocals(locals);
  if (!kv) return;
  try {
    const snapshot = await getThemeSnapshotById(db, themePostId);
    if (!snapshot) return;
    const state = parseThemeImportState(snapshot.meta_values);
    await kv.put(
      `${THEME_STATUS_KV_PREFIX}${snapshot.slug}`,
      JSON.stringify({
        id: snapshot.id,
        slug: snapshot.slug,
        ...state,
      })
    );
  } catch {
    // ignora falhas de sync de status
  }
}

/**
 * Invalida cache de post types arquiváveis usado no roteamento público de temas.
 */
export async function invalidateArchivablePostTypesCache(locals: App.Locals): Promise<void> {
  const kv = getKvFromLocals(locals);
  if (!kv?.delete) return;
  try {
    await kv.delete(ARCHIVABLE_POST_TYPES_KV_KEY);
  } catch {
    // ignora falha de delete
  }
}
