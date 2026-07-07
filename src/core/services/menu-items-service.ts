/**
 * Menu item child posts: load, serialize, and URL building for theme/admin.
 */
import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { Database } from "../../shared/types/database.ts";
import { locales, posts, postTypes } from "../../db/schema.ts";
import { slugify } from "../../utils/slugify.ts";
import { createPost, updatePost } from "./post-service.ts";
import {
  normalizePublicLocale,
  publicLocaleUrlPrefix,
} from "../theme/resolve-route.ts";
import { buildTaxonomyPublicPath } from "../theme/taxonomy-routes.ts";
import { getMetaSchemaTaxonomyTypes } from "../../utils/meta-parser.ts";
import { filterTaxonomyTypesForUi } from "./taxonomy-type-registry.ts";

export type MenuLinkType = "post" | "custom" | "taxonomy";

export type SubMenuSort = "alphabetical" | "creation";

export type SubMenuDisplay = "title" | "thumbnail" | "excerpt";

export const MENU_SEARCH_EXCLUDED_POST_TYPE_SLUGS = [
  "menus",
  "custom_fields",
  "attachment",
  "dashboard",
  "settings",
  "post_type",
  "themes",
  "user",
  "translations_languages",
] as const;

export type MenuItemFormRow = {
  id?: number;
  /** Form-only stable id for resolving parent_client_id on save. */
  client_id?: string | null;
  label: string;
  slug: string;
  order: number;
  link_type: MenuLinkType;
  target_post_id?: number | null;
  target_post_type?: string;
  target_slug?: string;
  target_locale_code?: string;
  target_taxonomy_id?: number | null;
  target_taxonomy_type?: string;
  custom_url?: string;
  id_locale_code?: number | null;
  parent_menu_item_id?: number | null;
  /** Form-only reference to parent item client_id (new items). */
  parent_client_id?: string | null;
  submenu_sort?: SubMenuSort;
  submenu_display?: SubMenuDisplay[];
};

export type MenuItemPersistRow = {
  id?: number;
  title: string;
  slug: string;
  order: number;
  link_type: MenuLinkType;
  body: string;
  id_locale_code: number | null;
  target_post_id?: number | null;
  target_post_type?: string;
  target_slug?: string;
  target_locale_code?: string;
  target_taxonomy_id?: number | null;
  target_taxonomy_type?: string;
  submenu_sort?: SubMenuSort;
  submenu_display?: SubMenuDisplay[];
};

/** Flat menu row before tree assembly (theme / API). */
export type MenuItemFlatPublic = {
  id: number;
  label: string;
  url: string;
  slug: string;
  target_post_id?: number | null;
  order: number;
  parent_menu_item_id: number | null;
  submenu_sort?: SubMenuSort;
  submenu_display?: SubMenuDisplay[];
};

/** Nested menu item for theme context. */
export type MenuItemPublicRaw = Omit<MenuItemFlatPublic, "parent_menu_item_id" | "order"> & {
  children: MenuItemPublicRaw[];
};

function parseLinkType(raw: unknown): MenuLinkType {
  if (raw === "custom") return "custom";
  if (raw === "taxonomy") return "taxonomy";
  return "post";
}

function parseSubMenuSort(raw: unknown): SubMenuSort | undefined {
  if (raw === "alphabetical" || raw === "creation") return raw;
  return undefined;
}

function parseSubMenuDisplay(raw: unknown): SubMenuDisplay[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<SubMenuDisplay>(["title", "thumbnail", "excerpt"]);
  return raw.filter(
    (v): v is SubMenuDisplay => typeof v === "string" && allowed.has(v as SubMenuDisplay),
  );
}

function parseParentMenuItemId(raw: unknown): number | null {
  if (typeof raw === "number" && raw > 0) return raw;
  return null;
}

function sortMenuChildren<T extends { label: string; id: number; order: number }>(
  items: T[],
  sort: SubMenuSort | undefined,
): T[] {
  const mode = sort ?? "creation";
  const sorted = [...items];
  if (mode === "alphabetical") {
    sorted.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  } else {
    sorted.sort((a, b) => a.order - b.order || a.id - b.id);
  }
  return sorted;
}

/**
 * Groups flat menu items into a nested tree by parent_menu_item_id.
 */
export function buildMenuItemTree(
  flatItems: MenuItemFlatPublic[],
): MenuItemPublicRaw[] {
  const byParent = new Map<number | null, MenuItemFlatPublic[]>();
  for (const item of flatItems) {
    const parentId = item.parent_menu_item_id;
    const group = byParent.get(parentId) ?? [];
    group.push(item);
    byParent.set(parentId, group);
  }

  const sortByParent = new Map<number, SubMenuSort | undefined>();
  for (const item of flatItems) {
    if (item.submenu_sort) {
      sortByParent.set(item.id, item.submenu_sort);
    }
  }

  function buildLevel(parentId: number | null): MenuItemPublicRaw[] {
    const siblings = byParent.get(parentId) ?? [];
    const sorted =
      parentId == null
        ? [...siblings].sort((a, b) => a.order - b.order || a.id - b.id)
        : sortMenuChildren(siblings, sortByParent.get(parentId));

    return sorted.map((item) => {
      const { parent_menu_item_id: _parent, order: _order, ...rest } = item;
      return {
        ...rest,
        children: buildLevel(item.id),
      };
    });
  }

  return buildLevel(null);
}

function buildMenuItemMetaValues(
  persisted: MenuItemPersistRow,
  parentMenuItemId: number | null,
): string {
  return JSON.stringify({
    menu_order: persisted.order,
    link_type: persisted.link_type,
    parent_menu_item_id: parentMenuItemId,
    ...(persisted.submenu_sort ? { submenu_sort: persisted.submenu_sort } : {}),
    ...(persisted.submenu_display?.length
      ? { submenu_display: persisted.submenu_display }
      : {}),
    ...(persisted.link_type === "post"
      ? {
          target_post_id: persisted.target_post_id ?? null,
          target_post_type: persisted.target_post_type ?? "",
          target_slug: persisted.target_slug ?? "",
          target_locale_code: persisted.target_locale_code ?? "",
        }
      : {}),
    ...(persisted.link_type === "taxonomy"
      ? {
          target_taxonomy_id: persisted.target_taxonomy_id ?? null,
          target_taxonomy_type: persisted.target_taxonomy_type ?? "",
          target_slug: persisted.target_slug ?? "",
          target_locale_code: persisted.target_locale_code ?? "",
        }
      : {}),
  });
}

function resolveClientId(row: MenuItemFormRow, index: number): string {
  if (row.client_id?.trim()) return row.client_id.trim();
  if (row.id != null && row.id > 0) return `menu-${row.id}`;
  return `menu-new-${index}`;
}

function resolveParentMenuItemId(
  row: MenuItemFormRow,
  clientIdToDbId: Map<string, number>,
): number | null {
  if (row.parent_menu_item_id != null && row.parent_menu_item_id > 0) {
    return row.parent_menu_item_id;
  }
  const parentClientId = row.parent_client_id?.trim();
  if (!parentClientId) return null;
  return clientIdToDbId.get(parentClientId) ?? null;
}

export function buildMenuItemUrl(input: {
  link_type: MenuLinkType;
  body?: string | null;
  target_slug?: string | null;
  target_locale_code?: string | null;
  target_taxonomy_type?: string | null;
}): string {
  if (input.link_type === "custom") {
    return String(input.body ?? "").trim();
  }

  const slug = String(input.target_slug ?? "").trim();
  if (!slug) return "";

  const localeCode = String(input.target_locale_code ?? "pt_BR").trim();
  const publicLocale = normalizePublicLocale(
    localeCode.replace(/_/g, "-").toLowerCase(),
  );
  const prefix = publicLocaleUrlPrefix(publicLocale);

  if (input.link_type === "taxonomy") {
    const taxonomyType = String(input.target_taxonomy_type ?? "").trim();
    if (!taxonomyType) return "";
    return buildTaxonomyPublicPath(taxonomyType, slug, prefix);
  }

  return `${prefix}/${slug}`.replace(/\/+/g, "/") || `/${slug}`;
}

export async function getEnabledTaxonomyTypesFromPostTypes(
  db: Database,
): Promise<string[]> {
  const rows = await db
    .select({ meta_schema: postTypes.meta_schema })
    .from(postTypes)
    .where(
      notInArray(postTypes.slug, [...MENU_SEARCH_EXCLUDED_POST_TYPE_SLUGS]),
    );

  const types = new Set<string>();
  for (const row of rows) {
    let metaSchema: unknown = row.meta_schema;
    if (typeof metaSchema === "string") {
      try {
        metaSchema = JSON.parse(metaSchema) as unknown;
      } catch {
        continue;
      }
    }
    for (const type of getMetaSchemaTaxonomyTypes(metaSchema)) {
      types.add(type);
    }
  }

  return filterTaxonomyTypesForUi([...types]);
}

export function menuItemRowToPersist(
  row: MenuItemFormRow,
  parentLocaleId: number | null,
): MenuItemPersistRow {
  const isCustom = row.link_type === "custom";
  const isTaxonomy = row.link_type === "taxonomy";
  return {
    ...(row.id != null && row.id > 0 ? { id: row.id } : {}),
    title: row.label.trim(),
    slug: slugify(row.slug || row.label) || slugify(row.label) || "menu-item",
    order: row.order,
    link_type: row.link_type,
    body: isCustom ? String(row.custom_url ?? "").trim() : "",
    id_locale_code: isCustom
      ? parentLocaleId
      : row.id_locale_code ?? parentLocaleId,
    target_post_id: isCustom || isTaxonomy ? null : row.target_post_id ?? null,
    target_post_type: isCustom || isTaxonomy ? undefined : row.target_post_type,
    target_slug: isCustom ? undefined : row.target_slug,
    target_locale_code: isCustom ? undefined : row.target_locale_code,
    target_taxonomy_id: isTaxonomy ? row.target_taxonomy_id ?? null : undefined,
    target_taxonomy_type: isTaxonomy ? row.target_taxonomy_type : undefined,
    submenu_sort: row.submenu_sort,
    submenu_display: row.submenu_display?.length ? row.submenu_display : undefined,
  };
}

export async function getMenuItemsForPost(
  db: Database,
  menuPostId: number,
  menusTypeId: number,
): Promise<MenuItemFormRow[]> {
  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      body: posts.body,
      id_locale_code: posts.id_locale_code,
      meta_values: posts.meta_values,
      locale_code: locales.locale_code,
    })
    .from(posts)
    .leftJoin(locales, eq(posts.id_locale_code, locales.id))
    .where(
      and(
        eq(posts.parent_id, menuPostId),
        eq(posts.post_type_id, menusTypeId),
      ),
    )
    .orderBy(
      asc(sql`COALESCE(CAST(json_extract(${posts.meta_values}, '$.menu_order') AS INTEGER), 9999)`),
      asc(posts.id),
    );

  return rows.map((row, index) => {
    let meta: Record<string, unknown> = {};
    if (row.meta_values) {
      try {
        meta = JSON.parse(row.meta_values) as Record<string, unknown>;
      } catch {
        meta = {};
      }
    }
    const linkType = parseLinkType(meta["link_type"]);
    const menuOrder =
      typeof meta["menu_order"] === "number"
        ? meta["menu_order"]
        : index + 1;

    return {
      id: row.id,
      label: String(row.title ?? ""),
      slug: String(row.slug ?? ""),
      order: menuOrder,
      link_type: linkType,
      target_post_id:
        typeof meta["target_post_id"] === "number"
          ? meta["target_post_id"]
          : null,
      target_post_type:
        typeof meta["target_post_type"] === "string"
          ? meta["target_post_type"]
          : undefined,
      target_slug:
        typeof meta["target_slug"] === "string" ? meta["target_slug"] : undefined,
      target_locale_code:
        typeof meta["target_locale_code"] === "string"
          ? meta["target_locale_code"]
          : row.locale_code ?? undefined,
      target_taxonomy_id:
        typeof meta["target_taxonomy_id"] === "number"
          ? meta["target_taxonomy_id"]
          : null,
      target_taxonomy_type:
        typeof meta["target_taxonomy_type"] === "string"
          ? meta["target_taxonomy_type"]
          : undefined,
      custom_url: linkType === "custom" ? String(row.body ?? "") : undefined,
      id_locale_code: row.id_locale_code,
      parent_menu_item_id: parseParentMenuItemId(meta["parent_menu_item_id"]),
      submenu_sort: parseSubMenuSort(meta["submenu_sort"]),
      submenu_display: parseSubMenuDisplay(meta["submenu_display"]),
    };
  });
}

export async function loadPublishedMenusByLocation(
  db: Database,
  dbLocale: string,
): Promise<Record<string, MenuItemPublicRaw[]>> {
  const [menusType] = await db
    .select({ id: postTypes.id })
    .from(postTypes)
    .where(eq(postTypes.slug, "menus"))
    .limit(1);

  if (!menusType) return {};

  const parentMenus = await db
    .select({
      id: posts.id,
      slug: posts.slug,
    })
    .from(posts)
    .where(
      and(
        eq(posts.post_type_id, menusType.id),
        eq(posts.status, "published"),
        isNull(posts.parent_id),
        sql`(json_extract(${posts.meta_values}, '$.show_in_menu') IS NULL OR json_extract(${posts.meta_values}, '$.show_in_menu') != 1)`,
      ),
    );

  if (parentMenus.length === 0) return {};

  const parentIds = parentMenus.map((p) => p.id);
  const childRows = await db
    .select({
      id: posts.id,
      parent_id: posts.parent_id,
      title: posts.title,
      body: posts.body,
      meta_values: posts.meta_values,
    })
    .from(posts)
    .where(
      and(
        eq(posts.post_type_id, menusType.id),
        eq(posts.status, "published"),
        inArray(posts.parent_id, parentIds),
      ),
    )
    .orderBy(
      asc(sql`COALESCE(CAST(json_extract(${posts.meta_values}, '$.menu_order') AS INTEGER), 9999)`),
      asc(posts.id),
    );

  const slugByParentId = new Map(parentMenus.map((p) => [p.id, p.slug]));
  const flatByLocation = new Map<string, MenuItemFlatPublic[]>();

  for (const row of childRows) {
    const parentId = row.parent_id;
    if (parentId == null) continue;
    const location = slugByParentId.get(parentId);
    if (!location) continue;

    let meta: Record<string, unknown> = {};
    if (row.meta_values) {
      try {
        meta = JSON.parse(row.meta_values) as Record<string, unknown>;
      } catch {
        meta = {};
      }
    }
    const linkType = parseLinkType(meta["link_type"]);
    const label = String(row.title ?? "").trim();
    const url = buildMenuItemUrl({
      link_type: linkType,
      body: row.body,
      target_slug:
        typeof meta["target_slug"] === "string" ? meta["target_slug"] : null,
      target_locale_code:
        typeof meta["target_locale_code"] === "string"
          ? meta["target_locale_code"]
          : dbLocale,
      target_taxonomy_type:
        typeof meta["target_taxonomy_type"] === "string"
          ? meta["target_taxonomy_type"]
          : null,
    });

    if (!label || !url) continue;

    const menuOrder =
      typeof meta["menu_order"] === "number" ? meta["menu_order"] : row.id;

    const flatItem: MenuItemFlatPublic = {
      id: row.id,
      label,
      url,
      slug: String(row.slug ?? ""),
      target_post_id:
        typeof meta["target_post_id"] === "number" ? meta["target_post_id"] : null,
      order: menuOrder,
      parent_menu_item_id: parseParentMenuItemId(meta["parent_menu_item_id"]),
      submenu_sort: parseSubMenuSort(meta["submenu_sort"]),
      submenu_display: parseSubMenuDisplay(meta["submenu_display"]),
    };

    const group = flatByLocation.get(location) ?? [];
    group.push(flatItem);
    flatByLocation.set(location, group);
  }

  const result: Record<string, MenuItemPublicRaw[]> = {};
  for (const [location, flatItems] of flatByLocation) {
    result[location] = buildMenuItemTree(flatItems);
  }

  return result;
}

export async function persistMenuItems(
  db: Database,
  params: {
    menuPostId: number;
    menusTypeId: number;
    items: MenuItemFormRow[];
    parentLocaleId: number | null;
    status: "draft" | "published" | "archived";
    author_id: string | null;
    now: number;
  },
): Promise<number[]> {
  const { menuPostId, menusTypeId, items, parentLocaleId, status, author_id, now } =
    params;

  const existingRows = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        eq(posts.parent_id, menuPostId),
        eq(posts.post_type_id, menusTypeId),
      ),
    );

  const keepIds = new Set(
    items
      .map((item) => item.id)
      .filter((id): id is number => typeof id === "number" && id > 0),
  );

  const idsToDelete = existingRows
    .map((row) => row.id)
    .filter((id) => !keepIds.has(id));

  if (idsToDelete.length > 0) {
    await db.delete(posts).where(inArray(posts.id, idsToDelete));
  }

  const savedIds: number[] = [];
  const clientIdToDbId = new Map<string, number>();

  const indexedItems = items.map((row, index) => ({
    row,
    clientId: resolveClientId(row, index),
    index,
  }));

  const isRoot = (row: MenuItemFormRow) =>
    !row.parent_client_id?.trim() &&
    (row.parent_menu_item_id == null || row.parent_menu_item_id <= 0);

  const roots = indexedItems.filter(({ row }) => isRoot(row));
  const children = indexedItems.filter(({ row }) => !isRoot(row));

  async function saveOne(
    entry: (typeof indexedItems)[number],
    parentMenuItemId: number | null,
  ): Promise<number> {
    const { row, index } = entry;
    const persisted = menuItemRowToPersist(
      { ...row, order: row.order || index + 1 },
      parentLocaleId,
    );
    const metaValues = buildMenuItemMetaValues(persisted, parentMenuItemId);
    const uniqueSlug = `${persisted.slug}-${menuPostId}-${index + 1}`;

    if (persisted.id != null && persisted.id > 0) {
      await updatePost(db, persisted.id, menusTypeId, {
        title: persisted.title,
        slug: uniqueSlug,
        body: persisted.body,
        status,
        author_id,
        parent_id: menuPostId,
        id_locale_code: persisted.id_locale_code,
        meta_values: metaValues,
        updated_at: now,
      });
      return persisted.id;
    }

    return createPost(db, {
      post_type_id: menusTypeId,
      parent_id: menuPostId,
      title: persisted.title,
      slug: uniqueSlug,
      body: persisted.body,
      status,
      author_id,
      id_locale_code: persisted.id_locale_code,
      meta_values: metaValues,
      created_at: now,
      updated_at: now,
    });
  }

  for (const entry of roots.sort((a, b) => (a.row.order || 0) - (b.row.order || 0))) {
    const dbId = await saveOne(entry, null);
    clientIdToDbId.set(entry.clientId, dbId);
    savedIds.push(dbId);
  }

  for (const entry of children) {
    const parentMenuItemId = resolveParentMenuItemId(entry.row, clientIdToDbId);
    const dbId = await saveOne(entry, parentMenuItemId);
    clientIdToDbId.set(entry.clientId, dbId);
    savedIds.push(dbId);
  }

  return savedIds;
}
