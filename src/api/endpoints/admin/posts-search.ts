/**
 * GET /api/admin/posts-search — Autocomplete de posts e taxonomias para o builder de menus.
 */
import type { APIRoute } from "astro";
import { and, eq, inArray, like, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "../../../db/index.ts";
import { locales, posts, postTypes, taxonomies } from "../../../db/schema.ts";
import {
  getRoleFromUser,
  canAccessRoute,
} from "../../../utils/permissions.ts";
import {
  badRequestResponse,
  jsonResponse,
  unauthorizedResponse,
  errorResponse,
} from "../../../utils/http-responses.ts";
import { HTTP_STATUS_CODES } from "../../../shared/constants/index.ts";
import {
  getEnabledTaxonomyTypesFromPostTypes,
  MENU_SEARCH_EXCLUDED_POST_TYPE_SLUGS,
} from "../../../core/services/menu-items-service.ts";

export const prerender = false;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export const GET: APIRoute = async ({ url, locals }) => {
  const user = locals.user;
  if (!user) {
    return unauthorizedResponse();
  }

  const roleId = getRoleFromUser(user);
  const allowed = await canAccessRoute(db, roleId, "/admin/content");
  if (!allowed) {
    return errorResponse("Forbidden", HTTP_STATUS_CODES.FORBIDDEN);
  }

  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return badRequestResponse("q é obrigatório");
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "", 10) || DEFAULT_LIMIT),
  );

  const postLimit = Math.ceil(limit / 2);
  const taxonomyLimit = limit - postLimit;

  const postRows = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      post_type_slug: postTypes.slug,
      id_locale_code: posts.id_locale_code,
      locale_code: locales.locale_code,
    })
    .from(posts)
    .innerJoin(postTypes, eq(posts.post_type_id, postTypes.id))
    .leftJoin(locales, eq(posts.id_locale_code, locales.id))
    .where(
      and(
        notInArray(postTypes.slug, [...MENU_SEARCH_EXCLUDED_POST_TYPE_SLUGS]),
        ne(posts.status, "trash"),
        or(
          like(posts.title, `%${q}%`),
          like(posts.slug, `%${q}%`),
        ),
        sql`(json_extract(${posts.meta_values}, '$.show_in_menu') IS NULL OR json_extract(${posts.meta_values}, '$.show_in_menu') != 1)`,
      ),
    )
    .orderBy(posts.title)
    .limit(postLimit);

  const enabledTaxonomyTypes = await getEnabledTaxonomyTypesFromPostTypes(db);

  let taxonomyRows: Array<{
    id: number;
    name: string | null;
    slug: string | null;
    type: string | null;
    id_locale_code: number | null;
    locale_code: string | null;
  }> = [];

  if (enabledTaxonomyTypes.length > 0 && taxonomyLimit > 0) {
    taxonomyRows = await db
      .select({
        id: taxonomies.id,
        name: taxonomies.name,
        slug: taxonomies.slug,
        type: taxonomies.type,
        id_locale_code: taxonomies.id_locale_code,
        locale_code: locales.locale_code,
      })
      .from(taxonomies)
      .leftJoin(locales, eq(taxonomies.id_locale_code, locales.id))
      .where(
        and(
          inArray(taxonomies.type, enabledTaxonomyTypes),
          sql`${taxonomies.parent_id} IS NOT NULL`,
          or(
            like(taxonomies.name, `%${q}%`),
            like(taxonomies.slug, `%${q}%`),
          ),
        ),
      )
      .orderBy(taxonomies.name)
      .limit(taxonomyLimit);
  }

  const items = [
    ...postRows.map((row) => ({
      kind: "post" as const,
      id: row.id,
      title: row.title ?? "",
      slug: row.slug ?? "",
      post_type_slug: row.post_type_slug,
      id_locale_code: row.id_locale_code,
      locale_code: row.locale_code ?? "",
    })),
    ...taxonomyRows.map((row) => ({
      kind: "taxonomy" as const,
      id: row.id,
      title: row.name ?? "",
      slug: row.slug ?? "",
      taxonomy_type: row.type ?? "",
      id_locale_code: row.id_locale_code,
      locale_code: row.locale_code ?? "",
    })),
  ];

  return jsonResponse({ items });
};
