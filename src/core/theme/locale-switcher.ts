import type { LocaleSwitcherItem, ResolvedPublicRoute, ThemeRouteKind } from "./types.ts";
import { publicLocaleHomeUrl, publicLocaleUrlPrefix } from "./resolve-route.ts";
import { buildArchivePublicPath } from "./post-type-routes.ts";

/** URL for switching to `targetLocale` while preserving the current public route shape. */
export function buildLocaleSwitcherUrl(
  targetLocale: string,
  route: ResolvedPublicRoute,
  kind: ThemeRouteKind,
  archivePostType?: string,
): string {
  const prefix = publicLocaleUrlPrefix(targetLocale);
  if (kind === "archive") {
    return buildArchivePublicPath(archivePostType ?? "post", prefix);
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

export function buildLocaleSwitcher(
  currentLocale: string,
  route: ResolvedPublicRoute,
  resolvedKind: ThemeRouteKind,
  archivePostType?: string,
): LocaleSwitcherItem[] {
  return LOCALE_SWITCHER_META.map(({ code, flag, label }) => ({
    code,
    flag,
    label,
    url: buildLocaleSwitcherUrl(code, route, resolvedKind, archivePostType),
    active: code === currentLocale,
  }));
}
