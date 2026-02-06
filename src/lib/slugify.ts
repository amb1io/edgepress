/**
 * Remove acentos, deixa minúsculo e junta palavras com "-".
 * Ex.: "Olá Mundo" → "ola-mundo"
 */
export function slugify(text: string): string {
  if (typeof text !== "string" || !text.trim()) return "";
  return text
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
