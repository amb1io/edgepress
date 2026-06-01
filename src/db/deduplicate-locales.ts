/**
 * Remove locales duplicados (variantes) e remapeia FKs para o locale canônico.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  locales,
  posts,
  settings,
  taxonomies,
  translationsLanguages,
} from "./schema.ts";
import { LOCALE_CODE_ALIASES } from "./seed-data.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function mergeLocaleFk(
  db: Db,
  table: typeof translationsLanguages | typeof posts | typeof taxonomies,
  fromId: number,
  toId: number
): Promise<void> {
  await db.update(table).set({ id_locale_code: toId }).where(eq(table.id_locale_code, fromId));
}

async function mergeTranslationsLanguages(
  db: Db,
  fromId: number,
  toId: number
): Promise<void> {
  const rows = await db
    .select({
      id: translationsLanguages.id,
      id_translations: translationsLanguages.id_translations,
    })
    .from(translationsLanguages)
    .where(eq(translationsLanguages.id_locale_code, fromId));

  for (const row of rows) {
    const [existing] = await db
      .select({ id: translationsLanguages.id })
      .from(translationsLanguages)
      .where(
        and(
          eq(translationsLanguages.id_translations, row.id_translations),
          eq(translationsLanguages.id_locale_code, toId)
        )
      )
      .limit(1);

    if (existing) {
      await db.delete(translationsLanguages).where(eq(translationsLanguages.id, row.id));
    } else {
      await db
        .update(translationsLanguages)
        .set({ id_locale_code: toId })
        .where(eq(translationsLanguages.id, row.id));
    }
  }
}

async function updateSiteLocalesSetting(db: Db, idMap: Map<number, number>): Promise<void> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.name, "site_locales"))
    .limit(1);

  const raw = String(row?.value ?? "").trim();
  if (!raw) return;

  const aliasIds = new Set(idMap.keys());
  const nextIds = [
    ...new Set(
      raw
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n))
        .map((id) => idMap.get(id) ?? id)
        .filter((id) => !aliasIds.has(id))
    ),
  ];

  await db
    .update(settings)
    .set({ value: nextIds.join(",") })
    .where(eq(settings.name, "site_locales"));
}

/**
 * Mescla variantes (en, pt-BR, es, …) nos locales canônicos (en_US, pt_BR, es_ES, …)
 * e remove as linhas duplicadas em `locales`.
 */
export async function deduplicateLocales(db: Db): Promise<{ removed: string[] }> {
  const allLocales = (await db
    .select({ id: locales.id, locale_code: locales.locale_code })
    .from(locales)) as { id: number; locale_code: string }[];

  const byCode = new Map(allLocales.map((r) => [r.locale_code, r.id]));
  const idMap = new Map<number, number>();

  for (const [aliasCode, canonicalCode] of Object.entries(LOCALE_CODE_ALIASES)) {
    const fromId = byCode.get(aliasCode);
    const toId = byCode.get(canonicalCode);
    if (fromId != null && toId != null && fromId !== toId) {
      idMap.set(fromId, toId);
    }
  }

  if (idMap.size === 0) {
    return { removed: [] };
  }

  for (const [fromId, toId] of idMap) {
    await mergeTranslationsLanguages(db, fromId, toId);
    await mergeLocaleFk(db, posts, fromId, toId);
    await mergeLocaleFk(db, taxonomies, fromId, toId);
  }

  await updateSiteLocalesSetting(db, idMap);

  const aliasCodes = Object.keys(LOCALE_CODE_ALIASES);
  await db.delete(locales).where(inArray(locales.locale_code, aliasCodes));

  return { removed: aliasCodes };
}
