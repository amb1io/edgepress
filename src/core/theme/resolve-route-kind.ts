import type { MatchedRoute } from "./file-router.ts";
import { isHomeTemplateKey, isSearchTemplateKey } from "./file-router.ts";
import {
  POST_TYPE_ARCHIVE_ALIASES,
  type ArchivablePostType,
  isArchivablePostTypeSlug,
} from "./post-type-routes.ts";
import type { ThemeRouteKind } from "./types.ts";

export type RouteKindResolverDeps = {
  archivablePostTypes: ArchivablePostType[];
  taxonomyTypes: string[];
  resolvePostBySlug: (slug: string) => Promise<{ post_type_slug: string } | null>;
  resolveTaxonomyTerm: (
    taxonomyType: string,
    termSlug: string,
  ) => Promise<{ slug: string } | null>;
};

export type ResolvedRouteKind = {
  kind: ThemeRouteKind;
  templateKey: string;
  params: Record<string, string>;
  slug?: string;
  postType?: string;
  taxonomyType?: string;
  taxonomySlug?: string;
};

function resolveArchivePostTypeFromSegment(
  segment: string,
  types: ArchivablePostType[],
): { postType: string; title: string } | null {
  const alias = POST_TYPE_ARCHIVE_ALIASES[segment];
  const normalized = alias ?? segment;
  if (!isArchivablePostTypeSlug(normalized, types)) return null;
  const match = types.find((type) => type.slug === normalized);
  return {
    postType: normalized,
    title: match?.name ?? (normalized === "post" ? "Blog" : normalized),
  };
}

function firstDynamicParamValue(params: Record<string, string>): string | undefined {
  const values = Object.values(params);
  return values[0];
}

function baseSegmentFromMatch(matched: MatchedRoute): string | null {
  if (matched.staticSegments[0]) return matched.staticSegments[0];
  return firstDynamicParamValue(matched.params) ?? null;
}

function hasExtraDynamicParams(matched: MatchedRoute): boolean {
  const dynamicCount = Object.keys(matched.params).length;
  if (matched.staticSegments.length === 0 && dynamicCount === 1) return false;
  return dynamicCount > 0;
}

export async function resolveRouteKind(
  matched: MatchedRoute | null,
  deps: RouteKindResolverDeps,
): Promise<ResolvedRouteKind> {
  if (!matched) {
    return { kind: "404", templateKey: "404", params: {} };
  }

  const { templateKey, params, staticSegments } = matched;

  if (isHomeTemplateKey(templateKey)) {
    return { kind: "home", templateKey, params };
  }

  if (isSearchTemplateKey(templateKey)) {
    return { kind: "search", templateKey, params };
  }

  const base = baseSegmentFromMatch(matched);
  if (!base) {
    return { kind: "404", templateKey: "404", params };
  }

  const archive = resolveArchivePostTypeFromSegment(base, deps.archivablePostTypes);
  if (archive && !hasExtraDynamicParams(matched)) {
    return {
      kind: "archive",
      templateKey,
      params,
      postType: archive.postType,
      slug: base,
    };
  }

  const isTaxonomyType = deps.taxonomyTypes.includes(base);
  if (isTaxonomyType && hasExtraDynamicParams(matched)) {
    const termSlug = firstDynamicParamValue(params);
    if (!termSlug) {
      return { kind: "404", templateKey: "404", params };
    }
    const term = await deps.resolveTaxonomyTerm(base, termSlug);
    if (!term) {
      return { kind: "404", templateKey: "404", params };
    }
    return {
      kind: "taxonomy",
      templateKey,
      params,
      taxonomyType: base,
      taxonomySlug: term.slug,
    };
  }

  const post = await deps.resolvePostBySlug(base);
  if (post) {
    const kind: ThemeRouteKind = post.post_type_slug === "post" ? "single" : "page";
    return {
      kind,
      templateKey,
      params,
      slug: base,
    };
  }

  // Nested detail routes like /portfolio/{slug} use a static prefix that is not
  // itself a post. Resolve the dynamic param when the base segment misses.
  if (hasExtraDynamicParams(matched)) {
    const nestedSlug = firstDynamicParamValue(params);
    if (nestedSlug && nestedSlug !== base) {
      const nestedPost = await deps.resolvePostBySlug(nestedSlug);
      if (nestedPost) {
        const kind: ThemeRouteKind = nestedPost.post_type_slug === "post" ? "single" : "page";
        return {
          kind,
          templateKey,
          params,
          slug: nestedSlug,
        };
      }
    }
  }

  return { kind: "404", templateKey: "404", params };
}

export function resolveFallbackTemplateKey(
  kind: ThemeRouteKind,
  templateKeys: Set<string>,
): string {
  if (kind === "404" && templateKeys.has("404")) return "404";
  if (kind === "archive" && templateKeys.has("archive")) return "archive";
  return "404";
}
