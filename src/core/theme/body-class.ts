import type { ResolvedPublicRoute, ThemePostView, ThemeRouteKind } from "./types.ts";

/** Maps a template key to a stable body slug, e.g. `diretores/index` → `diretores-index`. */
export function templateKeyToBodySlug(templateKey: string): string {
  return templateKey
    .trim()
    .replace(/\[\.\.\.([^\]]+)\]/g, "$1")
    .replace(/\[([^\]]+)\]/g, "$1")
    .split("/")
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function firstRouteSection(path: string, locale: string): string | null {
  const segment = path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean)[0];
  if (!segment) return null;
  const normalizedLocale = locale.replace(/_/g, "-").toLowerCase();
  if (segment.toLowerCase() === normalizedLocale) return null;
  if (["en", "es", "pt-br"].includes(segment.toLowerCase())) return null;
  return segment.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
}

export function buildBodyClass(
  route: ResolvedPublicRoute,
  post?: ThemePostView,
  resolvedKind?: ThemeRouteKind,
  taxonomy?: { type: string; slug: string },
  extraClasses?: string,
): string {
  const kind = resolvedKind ?? route.kind;
  const parts = [`route-${kind}`, `locale-${route.locale.replace(/-/g, "_")}`];

  const templateSlug = templateKeyToBodySlug(route.templateKey);
  if (templateSlug) parts.push(`slug-${templateSlug}`);

  const section = firstRouteSection(route.path, route.locale);
  if (section) parts.push(`route-${section}`);

  if (taxonomy?.type) parts.push(`taxonomy-${taxonomy.type}`);
  if (taxonomy?.slug) parts.push(`term-${taxonomy.slug.replace(/\//g, "-")}`);
  if (post?.post_type_slug) parts.push(`type-${post.post_type_slug}`);
  if (post?.slug) parts.push(`slug-${post.slug.replace(/\//g, "-")}`);

  const extra = String(extraClasses ?? "").trim();
  if (extra) parts.push(extra);

  return parts.join(" ");
}
