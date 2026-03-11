import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "../types/database.ts";
import {
  posts,
  taxonomies,
  postsTaxonomies,
  postsMedia,
  locales,
  translations,
  translationsLanguages,
  user,
  session,
  account,
} from "../../db/schema.ts";
import { buildContentPostPayload, type PostRow } from "../content-post-payload.ts";

export type IntrospectionNode = {
  table: string;
  id: number;
  record: Record<string, unknown>;
  relations: Record<string, IntrospectionNode[]>;
};

type VisitedMap = Map<string, Set<number>>;

function markVisited(visited: VisitedMap, table: string, id: number): boolean {
  const key = table;
  const set = visited.get(key) ?? new Set<number>();
  if (set.has(id)) return false;
  set.add(id);
  visited.set(key, set);
  return true;
}

async function loadPostNode(
  db: Database,
  id: number,
  depth: number,
  maxDepth: number,
  visited: VisitedMap,
): Promise<IntrospectionNode | null> {
  if (!markVisited(visited, "posts", id)) return null;

  const [row] = await db
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
    .where(eq(posts.id, id))
    .limit(1);

  if (!row) return null;

  const payload = await buildContentPostPayload(db, row as PostRow);

  const relations: Record<string, IntrospectionNode[]> = {};

  if (depth < maxDepth) {
    if (payload.meta_values?.parent_id) {
      const parentId = Number(payload.meta_values.parent_id);
      if (Number.isFinite(parentId) && parentId > 0) {
        const parent = await loadPostNode(db, parentId, depth + 1, maxDepth, visited);
        if (parent) relations["parent"] = [parent];
      }
    }

    const childrenRows = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.parent_id, id));
    const children: IntrospectionNode[] = [];
    for (const c of childrenRows) {
      const child = await loadPostNode(db, Number(c.id), depth + 1, maxDepth, visited);
      if (child) children.push(child);
    }
    if (children.length > 0) relations["children"] = children;

    const termLinks = await db
      .select({ term_id: postsTaxonomies.term_id })
      .from(postsTaxonomies)
      .where(eq(postsTaxonomies.post_id, id));
    const termIds = termLinks.map((l) => l.term_id).filter((v) => typeof v === "number");
    if (termIds.length > 0) {
      const termRows = await db
        .select({
          id: taxonomies.id,
          name: taxonomies.name,
          slug: taxonomies.slug,
          type: taxonomies.type,
          description: taxonomies.description,
          parent_id: taxonomies.parent_id,
        })
        .from(taxonomies)
        .where(inArray(taxonomies.id, termIds as number[]));
      const terms: IntrospectionNode[] = [];
      for (const t of termRows) {
        const node: IntrospectionNode = {
          table: "taxonomies",
          id: Number(t.id),
          record: t as Record<string, unknown>,
          relations: {},
        };
        terms.push(node);
      }
      if (terms.length > 0) relations["taxonomies"] = terms;
    }

    const mediaLinks = await db
      .select({ media_id: postsMedia.media_id })
      .from(postsMedia)
      .where(eq(postsMedia.post_id, id));
    const mediaIds = mediaLinks.map((m) => m.media_id).filter((v) => typeof v === "number");
    if (mediaIds.length > 0) {
      const mediaRows = await db
        .select({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          meta_values: posts.meta_values,
          created_at: posts.created_at,
        })
        .from(posts)
        .where(inArray(posts.id, mediaIds as number[]));
      const mediaNodes: IntrospectionNode[] = mediaRows.map((m) => ({
        table: "posts",
        id: Number(m.id),
        record: m as Record<string, unknown>,
        relations: {},
      }));
      if (mediaNodes.length > 0) relations["media"] = mediaNodes;
    }
  }

  return {
    table: "posts",
    id,
    record: payload as unknown as Record<string, unknown>,
    relations,
  };
}

async function loadTaxonomyNode(
  db: Database,
  id: number,
  depth: number,
  maxDepth: number,
  visited: VisitedMap,
): Promise<IntrospectionNode | null> {
  if (!markVisited(visited, "taxonomies", id)) return null;

  const [row] = await db
    .select({
      id: taxonomies.id,
      name: taxonomies.name,
      slug: taxonomies.slug,
      type: taxonomies.type,
      description: taxonomies.description,
      parent_id: taxonomies.parent_id,
      id_locale_code: taxonomies.id_locale_code,
      created_at: taxonomies.created_at,
      updated_at: taxonomies.updated_at,
    })
    .from(taxonomies)
    .where(eq(taxonomies.id, id))
    .limit(1);

  if (!row) return null;

  const relations: Record<string, IntrospectionNode[]> = {};

  if (depth < maxDepth) {
    if (row.parent_id != null) {
      const parent = await loadTaxonomyNode(db, Number(row.parent_id), depth + 1, maxDepth, visited);
      if (parent) relations["parent"] = [parent];
    }

    const childrenRows = await db
      .select({ id: taxonomies.id, name: taxonomies.name, slug: taxonomies.slug })
      .from(taxonomies)
      .where(eq(taxonomies.parent_id, id));
    const children: IntrospectionNode[] = childrenRows.map((c) => ({
      table: "taxonomies",
      id: Number(c.id),
      record: c as Record<string, unknown>,
      relations: {},
    }));
    if (children.length > 0) relations["children"] = children;

    const links = await db
      .select({ post_id: postsTaxonomies.post_id })
      .from(postsTaxonomies)
      .where(eq(postsTaxonomies.term_id, id));
    const postIds = links.map((l) => l.post_id).filter((v) => typeof v === "number");
    if (postIds.length > 0) {
      const postRows = await db
        .select({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          status: posts.status,
        })
        .from(posts)
        .where(inArray(posts.id, postIds as number[]));
      const postNodes: IntrospectionNode[] = postRows.map((p) => ({
        table: "posts",
        id: Number(p.id),
        record: p as Record<string, unknown>,
        relations: {},
      }));
      if (postNodes.length > 0) relations["posts"] = postNodes;
    }
  }

  return {
    table: "taxonomies",
    id,
    record: row as Record<string, unknown>,
    relations,
  };
}

async function loadUserNode(
  db: Database,
  id: string,
  depth: number,
  maxDepth: number,
): Promise<IntrospectionNode | null> {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);

  if (!row) return null;

  const relations: Record<string, IntrospectionNode[]> = {};

  if (depth < maxDepth) {
    const sessions = await db
      .select({
        id: session.id,
        token: session.token,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
      })
      .from(session)
      .where(eq(session.userId, id));
    if (sessions.length > 0) {
      relations["sessions"] = sessions.map((s) => ({
        table: "session",
        id: 0,
        record: s as Record<string, unknown>,
        relations: {},
      }));
    }

    const accounts = await db
      .select({
        id: account.id,
        providerId: account.providerId,
        accountId: account.accountId,
      })
      .from(account)
      .where(eq(account.userId, id));
    if (accounts.length > 0) {
      relations["accounts"] = accounts.map((a) => ({
        table: "account",
        id: 0,
        record: a as Record<string, unknown>,
        relations: {},
      }));
    }

    const authoredPosts = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        status: posts.status,
      })
      .from(posts)
      .where(eq(posts.author_id, id));
    if (authoredPosts.length > 0) {
      relations["posts"] = authoredPosts.map((p) => ({
        table: "posts",
        id: Number(p.id),
        record: p as Record<string, unknown>,
        relations: {},
      }));
    }
  }

  return {
    table: "user",
    id: NaN,
    record: row as Record<string, unknown>,
    relations,
  };
}

async function loadLocaleNode(
  db: Database,
  id: number,
  depth: number,
  maxDepth: number,
): Promise<IntrospectionNode | null> {
  const [row] = await db
    .select({
      id: locales.id,
      language: locales.language,
      locale_code: locales.locale_code,
      country: locales.country,
      timezone: locales.timezone,
    })
    .from(locales)
    .where(eq(locales.id, id))
    .limit(1);

  if (!row) return null;

  const relations: Record<string, IntrospectionNode[]> = {};

  if (depth < maxDepth) {
    const langs = await db
      .select({
        id: translationsLanguages.id,
        translation_id: translationsLanguages.translation_id,
        value: translationsLanguages.value,
      })
      .from(translationsLanguages)
      .where(eq(translationsLanguages.locale_id, id));
    if (langs.length > 0) {
      relations["translationsLanguages"] = langs.map((l) => ({
        table: "translations_languages",
        id: Number(l.id),
        record: l as Record<string, unknown>,
        relations: {},
      }));
    }
  }

  return {
    table: "locales",
    id,
    record: row as Record<string, unknown>,
    relations,
  };
}

async function loadTranslationNode(
  db: Database,
  id: number,
  depth: number,
  maxDepth: number,
): Promise<IntrospectionNode | null> {
  const [row] = await db
    .select({
      id: translations.id,
      namespace: translations.namespace,
      key: translations.key,
      created_at: translations.created_at,
      updated_at: translations.updated_at,
    })
    .from(translations)
    .where(eq(translations.id, id))
    .limit(1);

  if (!row) return null;

  const relations: Record<string, IntrospectionNode[]> = {};

  if (depth < maxDepth) {
    const langs = await db
      .select({
        id: translationsLanguages.id,
        locale_id: translationsLanguages.locale_id,
        value: translationsLanguages.value,
      })
      .from(translationsLanguages)
      .where(eq(translationsLanguages.translation_id, id));
    if (langs.length > 0) {
      relations["languages"] = langs.map((l) => ({
        table: "translations_languages",
        id: Number(l.id),
        record: l as Record<string, unknown>,
        relations: {},
      }));
    }
  }

  return {
    table: "translations",
    id,
    record: row as Record<string, unknown>,
    relations,
  };
}

export async function introspectRecordWithRelations(params: {
  db: Database;
  table: string;
  id: number;
  maxDepth?: number;
}): Promise<IntrospectionNode | null> {
  const { db, table, id, maxDepth = 2 } = params;
  const depth = 0;
  const visited: VisitedMap = new Map();

  if (table === "posts") {
    return loadPostNode(db, id, depth, maxDepth, visited);
  }
  if (table === "taxonomies") {
    return loadTaxonomyNode(db, id, depth, maxDepth, visited);
  }
  if (table === "locales") {
    return loadLocaleNode(db, id, depth, maxDepth, visited);
  }
  if (table === "translations") {
    return loadTranslationNode(db, id, depth, maxDepth, visited);
  }

  const quotedId = id;

  if (table === "user") {
    return loadUserNode(db, String(quotedId), depth, maxDepth);
  }

  const rows = await db
    .select()
    .from(
      // @ts-ignore - tabela dinâmica tipada pelo Drizzle em runtime
      { table: (await import("../../db/schema.ts"))[table as keyof typeof import("../../db/schema.ts")] },
    )
    .where(eq((posts as never)["id"], quotedId as never))
    .limit(1) as unknown as Record<string, unknown>[];

  const row = rows[0];
  if (!row) return null;

  return {
    table,
    id,
    record: row,
    relations: {},
  };
}

