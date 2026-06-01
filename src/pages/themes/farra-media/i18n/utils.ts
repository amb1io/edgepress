import {
  edgePressLocaleToThemeLang,
  isEdgePressLocaleSegment,
  type ThemeLang,
} from "./locale.ts";
import { defaultLang, ui } from "./ui";

function isLangSegment(segment: string | undefined): segment is keyof typeof ui {
  return segment != null && segment in ui;
}

function stripThemeInternalPrefix(segments: string[]): string[] {
  const themesIdx = segments.indexOf("themes");
  if (themesIdx < 0) return segments;

  let start = themesIdx + 2;
  if (segments[start] === "pages") {
    start += 1;
  }
  return segments.slice(start);
}

function toPublicPathFromThemeSegments(segments: string[]): string {
  if (segments.length === 0) return "/";

  const edgeLocale = edgePressLocaleToThemeLang(segments[0] ?? "");
  if (edgeLocale) {
    const rest = segments.slice(1);
    if (rest.length === 0) {
      return edgeLocale === "en" ? "/en" : "/";
    }
    if (edgeLocale === "en") {
      return `/en/${rest.join("/")}`;
    }
    return `/${rest.join("/")}`;
  }

  if (isLangSegment(segments[0])) {
    const lang = segments[0];
    const rest = segments.slice(1);
    if (rest.length === 0) {
      return lang === "en" ? "/en" : "/";
    }
    return lang === "en" ? `/en/${rest.join("/")}` : `/${rest.join("/")}`;
  }

  return `/${segments.join("/")}`;
}

/** Caminho público sem prefixo interno `/themes/{slug}[/pages]`. */
export function getPublicPathFromUrl(url: URL): string {
  const segments = url.pathname.split("/").filter(Boolean);
  const themesIdx = segments.indexOf("themes");

  if (themesIdx >= 0) {
    return toPublicPathFromThemeSegments(stripThemeInternalPrefix(segments));
  }

  if (segments.length > 0 && isEdgePressLocaleSegment(segments[0])) {
    const themeLang = edgePressLocaleToThemeLang(segments[0]!)!;
    const rest = segments.slice(1);
    if (rest.length === 0) {
      return themeLang === "en" ? "/en" : "/";
    }
    if (themeLang === "en") {
      return `/en/${rest.join("/")}`;
    }
    return `/${rest.join("/")}`;
  }

  const normalized = url.pathname.replace(/\/+$/, "") || "/";
  return normalized;
}

export function getLanguageFromUrl(url: URL): ThemeLang {
  const segments = url.pathname.split("/").filter(Boolean);

  const themesIdx = segments.indexOf("themes");
  if (themesIdx >= 0) {
    const internal = stripThemeInternalPrefix(segments);
    const first = internal[0];
    const fromEdge = first ? edgePressLocaleToThemeLang(first) : null;
    if (fromEdge) return fromEdge;
    if (isLangSegment(first)) return first;
  }

  const first = segments[0];
  const fromEdge = first ? edgePressLocaleToThemeLang(first) : null;
  if (fromEdge) return fromEdge;
  if (isLangSegment(first)) return first;

  return defaultLang;
}
export function useTranslations(lang: keyof typeof ui) {
  return function t(key: keyof (typeof ui)[typeof defaultLang]) {
    return ui[lang][key] || ui[defaultLang][key];
  };
}

/** Prefixo de URL pública para páginas de portfolio/trabalho. */
export function portfolioBasePath(lang: keyof typeof ui): string {
  return lang === defaultLang ? "/portfolio" : "/en/portfolio";
}
