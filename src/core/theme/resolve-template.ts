import type { ThemeRouteKind } from "./types.ts";

export type TemplateResolveHints = {
  postTypeSlug?: string;
  postSlug?: string;
  archiveType?: string;
  taxonomyType?: string;
  taxonomySlug?: string;
};

/** Normalizes manifest template paths to KV keys (without `templates/` prefix or `.liquid`). */
export function normalizeTemplateKey(path: string): string {
  let key = path.trim().replace(/^\/+/, "");
  if (key.startsWith("templates/")) {
    key = key.slice("templates/".length);
  }
  if (key.endsWith(".liquid")) {
    key = key.slice(0, -".liquid".length);
  }
  return key;
}

function hasTemplate(pkgTemplates: Record<string, string>, key: string): boolean {
  return key in pkgTemplates;
}

function findTemplate(
  pkgTemplates: Record<string, string>,
  candidates: string[],
): string | null {
  for (const candidate of candidates) {
    if (hasTemplate(pkgTemplates, candidate)) return candidate;
  }
  return null;
}

/** WordPress-style template hierarchy candidates for a route kind. */
export function buildTemplateCandidates(
  kind: ThemeRouteKind,
  hints?: TemplateResolveHints,
): string[] {
  switch (kind) {
    case "home":
      return ["front-page", "home", "index"];
    case "single": {
      const type = hints?.postTypeSlug?.trim();
      const slug = hints?.postSlug?.trim();
      const candidates: string[] = [];
      if (type && slug) candidates.push(`single-${type}-${slug}`);
      if (type) candidates.push(`single-${type}`);
      candidates.push("single", "singular", "index");
      return candidates;
    }
    case "page": {
      const slug = hints?.postSlug?.trim();
      const candidates: string[] = [];
      if (slug) candidates.push(`page-${slug}`);
      candidates.push("page", "singular", "index");
      return candidates;
    }
    case "archive": {
      const type = hints?.archiveType ?? hints?.postTypeSlug ?? "post";
      return [`archive-${type}`, "archive", "index"];
    }
    case "taxonomy": {
      const type = hints?.taxonomyType ?? hints?.archiveType ?? "category";
      const slug = hints?.taxonomySlug?.trim();
      const candidates: string[] = [];
      if (type && slug) candidates.push(`taxonomy-${type}-${slug}`);
      if (type) candidates.push(`taxonomy-${type}`);
      candidates.push("taxonomy", `archive-${type}`, "archive", "index");
      return candidates;
    }
    case "404":
      return ["404", "index"];
    default:
      return ["index"];
  }
}

/** WordPress-style template hierarchy for Liquid themes. */
export function resolveTemplateKey(
  kind: ThemeRouteKind,
  pkgTemplates: Record<string, string>,
  hints?: TemplateResolveHints,
): string | null {
  const candidates = buildTemplateCandidates(kind, hints);
  return findTemplate(pkgTemplates, candidates);
}
