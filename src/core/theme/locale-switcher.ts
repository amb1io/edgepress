import type { Database } from "../../shared/types/database.ts";
import { adminUrlLocaleToDbCode } from "../../utils/admin-locale-constants.ts";
import { getLocalizedTaxonomySlug } from "../services/taxonomy-translation-service.ts";
import type { LocaleSwitcherItem, ResolvedPublicRoute, ThemeRouteKind } from "./types.ts";
import { publicLocaleHomeUrl, publicLocaleUrlPrefix } from "./resolve-route.ts";
import { buildArchivePublicPath } from "./post-type-routes.ts";
import { buildTaxonomyPublicPath } from "./taxonomy-routes.ts";

export type LocaleSwitcherOptions = {
  archivePostType?: string;
  taxonomyCanonicalSlug?: string;
  db?: Database;
};

/** URL for switching to `targetLocale` while preserving the current public route shape. */
export async function buildLocaleSwitcherUrl(
  targetLocale: string,
  route: ResolvedPublicRoute,
  kind: ThemeRouteKind,
  options: LocaleSwitcherOptions = {},
): Promise<string> {
  const prefix = publicLocaleUrlPrefix(targetLocale);
  if (kind === "taxonomy" && route.taxonomyType && route.taxonomySlug) {
    let termSlug = route.taxonomySlug;
    if (options.taxonomyCanonicalSlug && options.db) {
      const dbLocale = adminUrlLocaleToDbCode(targetLocale);
      termSlug = await getLocalizedTaxonomySlug(options.db, options.taxonomyCanonicalSlug, dbLocale);
    }
    return buildTaxonomyPublicPath(route.taxonomyType, termSlug, prefix);
  }
  if (kind === "archive") {
    return buildArchivePublicPath(options.archivePostType ?? "post", prefix);
  }
  if (kind === "search") {
    const path = `${prefix}/search`;
    const q = route.searchQuery?.trim() ?? "";
    if (q) return `${path}?q=${encodeURIComponent(q)}`;
    return path;
  }
  if (route.slug) {
    return `${prefix}/${route.slug}`;
  }
  return publicLocaleHomeUrl(targetLocale);
}

const LOCALE_SWITCHER_META: ReadonlyArray<{ code: string; flag: string; label: string }> = [
  { code: "pt-br", flag: "🇧🇷", label: "PT" },
  { code: "en", flag: "🇺🇸", label: "EN" },
];

export async function buildLocaleSwitcher(
  currentLocale: string,
  route: ResolvedPublicRoute,
  resolvedKind: ThemeRouteKind,
  options: LocaleSwitcherOptions = {},
): Promise<LocaleSwitcherItem[]> {
  return Promise.all(
    LOCALE_SWITCHER_META.map(async ({ code, flag, label }) => ({
      code,
      flag,
      label,
      url: await buildLocaleSwitcherUrl(code, route, resolvedKind, options),
      active: code === currentLocale,
    })),
  );
}
