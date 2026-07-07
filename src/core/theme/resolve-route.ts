import type { MatchedRoute } from "./file-router.ts";
import {
  buildRouteTable,
  matchRoute,
} from "./file-router.ts";
import type { ResolvedPublicRoute } from "./types.ts";

const LOCALE_PREFIXES = new Set(["pt_br", "pt-br", "pt", "en_us", "en-us", "en", "es_es", "es-es", "es"]);

export function normalizePublicLocale(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "pt-br";
  const lower = value.toLowerCase();
  if (value === "pt_BR" || lower === "pt-br" || lower === "pt_br" || lower === "pt") return "pt-br";
  if (value === "en_US" || lower === "en-us" || lower === "en_us" || lower === "en") return "en";
  if (value === "es_ES" || lower === "es-es" || lower === "es_es" || lower === "es") return "es";
  return value.toLowerCase();
}

export function localeToHtmlLang(locale: string): string {
  if (locale === "pt-br") return "pt-BR";
  if (locale === "es") return "es";
  if (locale === "en") return "en";
  return locale;
}

export const PUBLIC_THEME_LOCALES = ["pt-br", "en"] as const;

export function publicLocaleUrlPrefix(locale: string): string {
  const normalized = normalizePublicLocale(locale);
  return normalized === "pt-br" ? "" : `/${normalized}`;
}

export function publicLocaleHomeUrl(locale: string): string {
  const prefix = publicLocaleUrlPrefix(locale);
  return prefix || "/";
}

/** Maps public theme locale to Edgepress DB locale code for API query params. */
export function publicLocaleToDbCode(locale: string): string {
  const n = normalizePublicLocale(locale);
  if (n === "pt-br") return "pt_BR";
  if (n === "en") return "en_US";
  if (n === "es") return "es_ES";
  return "en_US";
}

export type PreRoute = {
  locale: string;
  path: string;
  page: number;
  searchQuery?: string;
  matched: MatchedRoute | null;
};

function parsePathSegments(pathname: string): { locale: string; segments: string[]; path: string } {
  let path = pathname.trim();
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.replace(/\/+$/, "");
  }

  const segments = path.split("/").filter(Boolean);
  let locale = "pt-br";
  let rest = segments;

  if (segments.length > 0) {
    const first = segments[0]!.toLowerCase().replace(/-/g, "_");
    const normalizedFirst = segments[0]!.replace(/_/g, "-").toLowerCase();
    if (LOCALE_PREFIXES.has(first) || LOCALE_PREFIXES.has(normalizedFirst)) {
      locale = normalizePublicLocale(segments[0]);
      rest = segments.slice(1);
    }
  }

  return { locale, segments: rest, path };
}

export function resolvePreRoute(
  pathname: string,
  searchParams: URLSearchParams,
  templateKeys: string[],
): PreRoute {
  const { locale, segments, path } = parsePathSegments(pathname);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const searchQuery = searchParams.get("q")?.trim() ?? "";
  const table = buildRouteTable(templateKeys);
  const matched = matchRoute(table, segments);

  return {
    locale,
    path,
    page,
    ...(matched?.templateKey === "search" ? { searchQuery } : {}),
    matched,
  };
}

/** @deprecated Use resolvePreRoute + resolveRouteKind. Kept for transitional imports. */
export function resolvePublicRoute(
  pathname: string,
  searchParams: URLSearchParams,
  templateKeys: string[] = [],
): ResolvedPublicRoute {
  const pre = resolvePreRoute(pathname, searchParams, templateKeys);
  if (!pre.matched) {
    return { kind: "404", locale: pre.locale, path: pre.path, page: pre.page, params: {} };
  }
  if (pre.matched.templateKey === "index") {
    return { kind: "home", locale: pre.locale, path: pre.path, page: pre.page, params: pre.matched.params };
  }
  if (pre.matched.templateKey === "search") {
    return {
      kind: "search",
      locale: pre.locale,
      path: pre.path,
      page: pre.page,
      searchQuery: pre.searchQuery ?? "",
      params: pre.matched.params,
    };
  }
  const base = pre.matched.staticSegments[0] ?? Object.values(pre.matched.params)[0];
  return {
    kind: "page",
    locale: pre.locale,
    path: pre.path,
    slug: base,
    page: pre.page,
    params: pre.matched.params,
  };
}
