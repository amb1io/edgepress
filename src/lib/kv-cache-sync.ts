/**
 * Sincronização do cache KV após create/update/delete nos formulários do site.
 * - Atualiza o registro KV correspondente quando possível (ex.: post por id/slug).
 * - Invalida listas ou caches que dependem dos dados alterados (ex.: content:posts:*, settings:*, i18n:*).
 */
import type { App } from "../env.d.ts";
import { getKvFromLocals } from "./utils/runtime-locals.ts";
import type { Database } from "./types/database.ts";
import { posts, postTypes } from "../db/schema.ts";
import { eq } from "drizzle-orm";
import { buildContentPostPayload } from "./content-post-payload.ts";
import {
  getActiveThemeFromDb,
  THEME_ACTIVE_KV_KEY,
  THEME_META_KV_PREFIX,
  THEME_STATUS_KV_PREFIX,
  getThemeSnapshotById,
  parseThemeImportState,
} from "./services/theme-service.ts";

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
        author_id: posts.author_id,
        title: posts.title,
        slug: posts.slug,
        excerpt: posts.excerpt,
        body: posts.body,
        status: posts.status,
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
    await Promise.all([
      kv.put(idKey, payloadStr),
      kv.put(slugStatusKey, payloadStr),
    ]);
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
