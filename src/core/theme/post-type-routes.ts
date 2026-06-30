import { notInArray } from "drizzle-orm";
import { postTypes } from "../../db/schema.ts";
import type { Database } from "../../shared/types/database.ts";
import type { KVLike } from "../../utils/runtime-locals.ts";
import type { ResolvedPublicRoute } from "./types.ts";

export const ARCHIVABLE_POST_TYPES_KV_KEY = "theme:archivable_post_types";
const ARCHIVABLE_POST_TYPES_TTL_SECONDS = 300;

export const POST_TYPE_ARCHIVE_ALIASES: Record<string, string> = {
  posts: "post",
};

export const NON_ARCHIVABLE_POST_TYPE_SLUGS = new Set([
  "page",
  "attachment",
  "themes",
  "user",
  "settings",
  "dashboard",
  "post_type",
  "custom_fields",
  "translations_languages",
  "menus",
]);

export type ArchivablePostType = {
  slug: string;
  name: string;
};

export function isArchivablePostTypeSlug(
  slug: string,
  types: ArchivablePostType[],
): boolean {
  const normalized = slug.trim().toLowerCase();
  return types.some((type) => type.slug === normalized);
}

export function resolveArchivePostTypeFromRoute(
  route: ResolvedPublicRoute,
  types: ArchivablePostType[],
): { postType: string; title: string } | null {
  if (route.kind === "archive") {
    const postType = route.postType ?? "post";
    const match = types.find((type) => type.slug === postType);
    return {
      postType,
      title: match?.name ?? (postType === "post" ? "Blog" : postType),
    };
  }

  if (route.slug && isArchivablePostTypeSlug(route.slug, types)) {
    const match = types.find((type) => type.slug === route.slug)!;
    return { postType: match.slug, title: match.name };
  }

  return null;
}

export function buildArchivePublicPath(postType: string, localePrefix: string): string {
  if (postType === "post") {
    return `${localePrefix}/posts`;
  }
  return `${localePrefix}/${postType}`;
}

export async function getArchivablePostTypes(
  db: Database,
  kv?: KVLike | null,
): Promise<ArchivablePostType[]> {
  if (kv) {
    try {
      const cached = await kv.get(ARCHIVABLE_POST_TYPES_KV_KEY, "json");
      if (Array.isArray(cached)) {
        return cached as ArchivablePostType[];
      }
    } catch {
      // segue para o banco
    }
  }

  const rows = await db
    .select({ slug: postTypes.slug, name: postTypes.name })
    .from(postTypes)
    .where(notInArray(postTypes.slug, [...NON_ARCHIVABLE_POST_TYPE_SLUGS]))
    .orderBy(postTypes.slug);

  const types = rows.map((row) => ({
    slug: row.slug,
    name: row.name,
  }));

  if (kv) {
    try {
      await kv.put(ARCHIVABLE_POST_TYPES_KV_KEY, JSON.stringify(types), {
        expirationTtl: ARCHIVABLE_POST_TYPES_TTL_SECONDS,
      });
    } catch {
      // ignora falha de cache
    }
  }

  return types;
}
