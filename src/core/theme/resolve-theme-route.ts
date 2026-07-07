import type { RouteKindResolverDeps } from "./resolve-route-kind.ts";
import { resolveRouteKind } from "./resolve-route-kind.ts";
import { resolvePreRoute } from "./resolve-route.ts";
import type { ResolvedPublicRoute } from "./types.ts";

export async function resolveThemeRoute(
  pathname: string,
  searchParams: URLSearchParams,
  templateKeys: string[],
  deps: RouteKindResolverDeps,
): Promise<ResolvedPublicRoute> {
  const pre = resolvePreRoute(pathname, searchParams, templateKeys);
  const resolved = await resolveRouteKind(pre.matched, deps);

  let templateKey = resolved.templateKey;
  if (!templateKeys.includes(templateKey)) {
    if (resolved.kind === "archive" && templateKeys.includes("archive")) {
      templateKey = "archive";
    } else if (resolved.kind === "404" && templateKeys.includes("404")) {
      templateKey = "404";
    }
  }

  return {
    kind: resolved.kind,
    locale: pre.locale,
    path: pre.path,
    page: pre.page,
    templateKey,
    params: resolved.params,
    ...(resolved.slug ? { slug: resolved.slug } : {}),
    ...(resolved.postType ? { postType: resolved.postType } : {}),
    ...(resolved.taxonomyType
      ? { taxonomyType: resolved.taxonomyType, taxonomySlug: resolved.taxonomySlug }
      : {}),
    ...(pre.searchQuery !== undefined ? { searchQuery: pre.searchQuery } : {}),
  };
}
