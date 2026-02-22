/**
 * Lista de ícones line-md (Iconify) para validação e dropdown no formulário de post types.
 * Gerado a partir de @iconify-json/line-md/metadata.json.
 */
import lineMdIconsJson from "./line-md-icons.json";

const LINE_MD_ICONS: string[] = lineMdIconsJson as string[];

const LINE_MD_ICONS_SET = new Set(LINE_MD_ICONS);

const DEFAULT_ICON = "line-md:document";

/** Retorna true se o valor for um ícone line-md válido. */
export function isValidLineMdIcon(value: unknown): value is string {
  return typeof value === "string" && LINE_MD_ICONS_SET.has(value);
}

/** Retorna o ícone se válido, senão o default line-md:document. */
export function normalizeLineMdIcon(value: unknown): string {
  return isValidLineMdIcon(value) ? value : DEFAULT_ICON;
}

export { LINE_MD_ICONS, DEFAULT_ICON };
