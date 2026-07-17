import {
  ContentBadRequestError,
  ContentNotFoundError,
  createEdgepressContent,
} from "../services/edgepress-content.ts";
import { db } from "../../db/index.ts";
import { getCacheKvFromLocals, getKvFromLocals } from "../../utils/runtime-locals.ts";
import { adminUrlLocaleToDbCode } from "../../utils/admin-locale-constants.ts";
import type { RouteKindResolverDeps } from "./resolve-route-kind.ts";
import { resolveThemeRoute } from "./resolve-theme-route.ts";
import { resolvePreRoute, themeDefaultLocale } from "./resolve-route.ts";
import { getArchivablePostTypes } from "./post-type-routes.ts";
import { getExistingTaxonomyTypes, getPublicTaxonomyTerm } from "./taxonomy-routes.ts";
import type { ResolvedPublicRoute } from "./types.ts";

export async function resolveThemeRouteForRequest(
  locals: App.Locals,
  pathname: string,
  searchParams: URLSearchParams,
  templateKeys: string[],
  defaultLocale = "pt-br",
): Promise<ResolvedPublicRoute> {
  const kv = getKvFromLocals(locals);
  const cacheKv = getCacheKvFromLocals(locals);
  const normalizedDefault = themeDefaultLocale(defaultLocale);
  const pre = resolvePreRoute(pathname, searchParams, templateKeys, normalizedDefault);
  const dbLocale = adminUrlLocaleToDbCode(pre.locale);
  const content = createEdgepressContent(locals, { baseUrl: "http://localhost" });
  const taxonomyCache = { kv: cacheKv };

  const [archivablePostTypes, taxonomyTypes] = await Promise.all([
    getArchivablePostTypes(db, kv),
    getExistingTaxonomyTypes(db, cacheKv),
  ]);

  const deps: RouteKindResolverDeps = {
    archivablePostTypes,
    taxonomyTypes,
    resolvePostBySlug: async (slug) => {
      try {
        const post = await content.getBySlug(slug, { status: "published" });
        return { post_type_slug: String(post.post_type_slug ?? post["post_types_slug"] ?? "page") };
      } catch (err) {
        if (err instanceof ContentNotFoundError || err instanceof ContentBadRequestError) {
          return null;
        }
        throw err;
      }
    },
    resolveTaxonomyTerm: async (taxonomyType, termSlug) => {
      const term = await getPublicTaxonomyTerm(
        db,
        taxonomyType,
        termSlug,
        dbLocale,
        taxonomyCache,
      );
      if (!term) return null;
      return { slug: term.slug };
    },
  };

  return resolveThemeRoute(pathname, searchParams, templateKeys, deps, normalizedDefault);
}
