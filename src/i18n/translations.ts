/**
 * System translations by locale.
 * Keys use dot notation (e.g. admin.menu.dashboard).
 * Each language is loaded from src/i18n/languages/{locale}.json
 */
import en from "./languages/en.json";
import es from "./languages/es.json";
import ptBr from "./languages/pt_br.json";

export type Locale = "en" | "es" | "pt-br";

export const translations: Record<Locale, Record<string, string>> = {
  en: en as Record<string, string>,
  es: es as Record<string, string>,
  "pt-br": ptBr as Record<string, string>,
};

export const defaultLocale: Locale = "pt-br";

export const locales: Locale[] = ["en", "es", "pt-br"];
