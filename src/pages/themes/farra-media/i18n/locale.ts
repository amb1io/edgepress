import { defaultLang, ui } from "./ui";

export type ThemeLang = keyof typeof ui;
export type EdgePressPublicLocale = "pt_BR" | "en_US" | "es_ES";

const EDGE_TO_THEME: Record<string, ThemeLang> = {
  pt_BR: "br",
  pt_br: "br",
  "pt-br": "br",
  pt: "br",
  br: "br",
  en_US: "en",
  en_us: "en",
  "en-us": "en",
  en: "en",
  es_ES: "br",
  es_es: "br",
  "es-es": "br",
  es: "br",
};

/** Locale EdgePress (URL/middleware) → idioma do tema (`br` | `en`). */
export function edgePressLocaleToThemeLang(segment: string): ThemeLang | null {
  const raw = segment.trim();
  if (!raw) return null;
  return EDGE_TO_THEME[raw] ?? EDGE_TO_THEME[raw.toLowerCase()] ?? null;
}

export function isEdgePressLocaleSegment(segment: string | undefined): boolean {
  return segment != null && edgePressLocaleToThemeLang(segment) != null;
}

export function themeLangToEdgePressLocale(lang: ThemeLang): EdgePressPublicLocale {
  return lang === "en" ? "en_US" : "pt_BR";
}

/** Href público do seletor de idioma (URL no browser, sem `/themes/...`). */
export function publicLocaleHref(locale: EdgePressPublicLocale): string {
  if (locale === "en_US") return "/en_US";
  if (locale === "es_ES") return "/es_ES";
  return "/";
}
