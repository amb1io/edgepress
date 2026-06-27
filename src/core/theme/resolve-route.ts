import { isValidSlug } from "../../utils/validation.ts";
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

/** URL path prefix for a public locale (`""` for pt-br, `/en` for English). */
export function publicLocaleUrlPrefix(locale: string): string {
  const normalized = normalizePublicLocale(locale);
  return normalized === "pt-br" ? "" : `/${normalized}`;
}

/** Home URL for a public locale. */
export function publicLocaleHomeUrl(locale: string): string {
  const prefix = publicLocaleUrlPrefix(locale);
  return prefix || "/";
}

/** Parses a public URL path into route kind + locale + slug segments. */
export function resolvePublicRoute(pathname: string, searchParams: URLSearchParams): ResolvedPublicRoute {
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

  if (rest.length === 0) {
    return { kind: "home", locale, path };
  }

  if (rest[0] === "posts" || rest[0] === "blog") {
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    return {
      kind: "archive",
      locale,
      path,
      postType: "post",
      page,
    };
  }

  const slug = rest.join("/");
  if (!isValidSlug(slug)) {
    return { kind: "404", locale, path };
  }
  return {
    kind: "page",
    locale,
    path,
    slug,
  };
}
