/**
 * Parse de campos de tradução do formulário de taxonomias.
 */
import { inArray } from "drizzle-orm";
import { locales } from "../db/schema.ts";
import type { Database } from "../shared/types/database.ts";
import { slugify } from "./slugify.ts";
import type { TranslationLocaleRow } from "./translation-upsert.ts";

const NAME_PREFIX = "translation_";
const SLUG_PREFIX = "translation_slug_";

function parsePrefixedTranslationFields(
  formData: FormData,
  prefix: string,
  transform?: (value: string) => string,
  excludePrefix?: string,
): Map<string, string> {
  const byLocaleCode = new Map<string, string>();
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith(prefix)) continue;
    if (excludePrefix && key.startsWith(excludePrefix)) continue;
    const localeCode = key.slice(prefix.length).trim();
    if (!localeCode) continue;
    let value = String(raw ?? "").trim();
    if (!value) continue;
    if (transform) value = transform(value);
    if (!value) continue;
    byLocaleCode.set(localeCode, value);
  }
  return byLocaleCode;
}

async function mapLocaleCodesToRows(
  db: Database,
  byLocaleCode: Map<string, string>,
): Promise<TranslationLocaleRow[]> {
  if (byLocaleCode.size === 0) return [];

  const localeCodes = [...byLocaleCode.keys()];
  const localeRows = await db
    .select({ id: locales.id, locale_code: locales.locale_code })
    .from(locales)
    .where(inArray(locales.locale_code, localeCodes));

  return localeRows
    .map((row) => ({
      locale_id: row.id,
      value: byLocaleCode.get(row.locale_code) ?? "",
    }))
    .filter((row) => row.locale_id && row.value);
}

export async function parseTaxonomyNameTranslationRows(
  db: Database,
  formData: FormData,
): Promise<TranslationLocaleRow[]> {
  const byLocaleCode = parsePrefixedTranslationFields(formData, NAME_PREFIX, undefined, SLUG_PREFIX);
  return mapLocaleCodesToRows(db, byLocaleCode);
}

export async function parseTaxonomySlugTranslationRows(
  db: Database,
  formData: FormData,
): Promise<TranslationLocaleRow[]> {
  const byLocaleCode = parsePrefixedTranslationFields(formData, SLUG_PREFIX, slugify);
  return mapLocaleCodesToRows(db, byLocaleCode);
}
