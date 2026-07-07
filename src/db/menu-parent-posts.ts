/**
 * Posts "pai" do menu lateral (show_in_menu): slug canônico, upsert e deduplicação.
 */
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { posts, postTypes } from "./schema.ts";
import {
  MENU_CONFIG,
  META_ONLY_POST_TYPE_SLUGS,
  type MenuConfigRow,
} from "./seed-data.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Slug estável do post de menu por post type (mesmo valor usado no seed SQL remoto). */
export function menuPostSlug(typeSlug: string): string {
  return `menu-${typeSlug}`;
}

/** Slug legado com sufixo numérico (seed antigo: menu-themes-1779359219772). */
export function isLegacyMenuPostSlug(slug: string, typeSlug: string): boolean {
  const canonical = menuPostSlug(typeSlug);
  return slug !== canonical && slug.startsWith(`${canonical}-`);
}

export const menuParentShowInMenuSql = sql`(
  json_extract(${posts.meta_values}, '$.show_in_menu') = 1
  OR json_extract(${posts.meta_values}, '$.show_in_menu') = true
  OR json_extract(${posts.meta_values}, '$.show_in_menu') = '1'
  OR lower(coalesce(json_extract(${posts.meta_values}, '$.show_in_menu'), '')) = 'true'
)`;

function buildMenuMetaValues(config: MenuConfigRow): string {
  return JSON.stringify({
    show_in_menu: true,
    menu_options: config.menu_options,
    menu_order: config.menu_order,
    icon: config.icon,
    post_types: ["custom_fields"],
  });
}

type MenuCandidateRow = { id: number; slug: string; post_type_id: number };

function pickMenuKeeper(
  candidates: MenuCandidateRow[],
  typeSlug: string,
  typeId: number,
): MenuCandidateRow | null {
  if (candidates.length === 0) return null;
  const canonical = menuPostSlug(typeSlug);
  const sorted = [...candidates].sort((a, b) => {
    if (a.slug === canonical && b.slug !== canonical) return -1;
    if (b.slug === canonical && a.slug !== canonical) return 1;
    const aLegacy = isLegacyMenuPostSlug(a.slug, typeSlug);
    const bLegacy = isLegacyMenuPostSlug(b.slug, typeSlug);
    if (aLegacy && !bLegacy) return 1;
    if (!aLegacy && bLegacy) return -1;
    if (a.post_type_id === typeId && b.post_type_id !== typeId) return -1;
    if (b.post_type_id === typeId && a.post_type_id !== typeId) return 1;
    return a.id - b.id;
  });
  return sorted[0] ?? null;
}

/** Garante um post de menu por entrada do MENU_CONFIG (idempotente). */
export async function ensureMenuPostsFromConfig(
  db: Db,
  typeIds: Record<string, number>,
  now: number,
): Promise<void> {
  for (const config of MENU_CONFIG) {
    if (META_ONLY_POST_TYPE_SLUGS.has(config.typeSlug)) continue;
    const typeId = typeIds[config.typeSlug];
    if (!typeId) continue;

    const canonical = menuPostSlug(config.typeSlug);
    const metaValues = buildMenuMetaValues(config);

    const candidates = (await db
      .select({
        id: posts.id,
        slug: posts.slug,
        post_type_id: posts.post_type_id,
      })
      .from(posts)
      .where(
        or(
          eq(posts.slug, canonical),
          sql`${posts.slug} LIKE ${`${canonical}-%`}`,
          and(eq(posts.post_type_id, typeId), menuParentShowInMenuSql),
        ),
      )) as MenuCandidateRow[];

    const keeper = pickMenuKeeper(candidates, config.typeSlug, typeId);

    if (keeper) {
      await db
        .update(posts)
        .set({
          post_type_id: typeId,
          title: config.typeSlug,
          slug: canonical,
          meta_values: metaValues,
          updated_at: now,
        })
        .where(eq(posts.id, keeper.id));
    } else {
      await db.insert(posts).values({
        post_type_id: typeId,
        title: config.typeSlug,
        slug: canonical,
        status: "published",
        meta_values: metaValues,
        created_at: now,
        updated_at: now,
      });
    }
  }

  await deduplicateMenuPosts(db);
}

/**
 * Remove posts duplicados com show_in_menu por post_type_id.
 * Mantém slug canônico menu-{typeSlug} quando existir; senão o de menor id.
 */
export async function deduplicateMenuPosts(db: Db): Promise<{ removed: number[] }> {
  const menuRows = (await db
    .select({
      id: posts.id,
      post_type_id: posts.post_type_id,
      slug: posts.slug,
    })
    .from(posts)
    .where(menuParentShowInMenuSql)) as MenuCandidateRow[];

  const typeRows = (await db
    .select({ id: postTypes.id, slug: postTypes.slug })
    .from(postTypes)) as { id: number; slug: string }[];
  const slugByTypeId = new Map(typeRows.map((r) => [r.id, r.slug]));

  const byTypeId = new Map<number, MenuCandidateRow[]>();
  for (const row of menuRows) {
    const group = byTypeId.get(row.post_type_id) ?? [];
    group.push(row);
    byTypeId.set(row.post_type_id, group);
  }

  const toDelete = new Set<number>();

  for (const [typeId, group] of byTypeId) {
    if (group.length <= 1) continue;
    const typeSlug = slugByTypeId.get(typeId) ?? "";
    const keeper = pickMenuKeeper(group, typeSlug, typeId);
    if (!keeper) continue;
    for (const row of group) {
      if (row.id !== keeper.id) toDelete.add(row.id);
    }
  }

  // Slug indica outro post type (ex.: menu-themes no tipo user) — remove se o canônico já existe.
  const knownTypeSlugs = [...slugByTypeId.values()].sort((a, b) => b.length - a.length);
  for (const row of menuRows) {
    if (toDelete.has(row.id)) continue;
    const intendedType = knownTypeSlugs.find(
      (typeSlug) =>
        row.slug === menuPostSlug(typeSlug) || isLegacyMenuPostSlug(row.slug, typeSlug),
    );
    if (!intendedType) continue;
    const intendedTypeId = typeRows.find((t) => t.slug === intendedType)?.id;
    if (intendedTypeId == null || intendedTypeId === row.post_type_id) continue;

    const canonicalForIntended = menuPostSlug(intendedType);
    const hasCanonical = menuRows.some(
      (r) =>
        r.id !== row.id &&
        !toDelete.has(r.id) &&
        r.post_type_id === intendedTypeId &&
        (r.slug === canonicalForIntended || isLegacyMenuPostSlug(r.slug, intendedType)),
    );
    if (hasCanonical) {
      toDelete.add(row.id);
    }
  }

  const removed = [...toDelete];
  if (removed.length > 0) {
    await db.delete(posts).where(inArray(posts.id, removed));
  }

  return { removed };
}
