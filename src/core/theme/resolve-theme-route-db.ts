import {
  ContentBadRequestError,
  ContentNotFoundError,
  createEdgepressContent,
} from "../services/edgepress-content.ts";
import { db } from "../../db/index.ts";
import { getKvFromLocals } from "../../utils/runtime-locals.ts";
import { adminUrlLocaleToDbCode } from "../../utils/admin-locale-constants.ts";
import type { RouteKindResolverDeps } from "./resolve-route-kind.ts";
import { resolveThemeRoute } from "./resolve-theme-route.ts";
import { getArchivablePostTypes } from "./post-type-routes.ts";
import { getExistingTaxonomyTypes, getPublicTaxonomyTerm } from "./taxonomy-routes.ts";
import type { ResolvedPublicRoute } from "./types.ts";

export async function resolveThemeRouteForRequest(
  locals: App.Locals,
  pathname: string,
  searchParams: URLSearchParams,
  templateKeys: string[],
): Promise<ResolvedPublicRoute> {
  const kv = getKvFromLocals(locals);
  const preLocale = pathname.startsWith("/en")
    ? "en"
    : pathname.startsWith("/es")
      ? "es"
      : "pt-br";
  const dbLocale = adminUrlLocaleToDbCode(preLocale);
  const content = createEdgepressContent(locals, { baseUrl: "http://localhost" });

  const [archivablePostTypes, taxonomyTypes] = await Promise.all([
    getArchivablePostTypes(db, kv),
    getExistingTaxonomyTypes(db),
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
      const term = await getPublicTaxonomyTerm(db, taxonomyType, termSlug, dbLocale);
      if (!term) return null;
      return { slug: term.slug };
    },
  };

  return resolveThemeRoute(pathname, searchParams, templateKeys, deps);
}
