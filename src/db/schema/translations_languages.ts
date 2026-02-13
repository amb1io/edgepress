import { index, int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { translations } from "./translations.ts";
import { locales } from "./locales.ts";

/**
 * Tabela de relacionamento translations-locales
 * Armazena as traduções de cada chave para cada locale
 */
export const translationsLanguages = sqliteTable(
  "translations_languages",
  {
    id: int().primaryKey({ autoIncrement: true }),
    id_translations: int("id_translations")
      .notNull()
      .references(() => translations.id, { onDelete: "cascade" }),
    id_locale_code: int("id_locale_code")
      .notNull()
      .references(() => locales.id, { onDelete: "cascade" }),
    value: text().notNull(),
  },
  (table) => ({
    translationsIdIdx: index("translations_languages_id_translations_idx").on(
      table.id_translations
    ),
    localeCodeIdIdx: index("translations_languages_id_locale_code_idx").on(
      table.id_locale_code
    ),
    translationsLocaleIdx: index("translations_languages_translations_locale_idx").on(
      table.id_translations,
      table.id_locale_code
    ),
    uniqueTranslationLocale: unique("translations_languages_unique_translation_locale").on(
      table.id_translations,
      table.id_locale_code
    ),
  })
);

/**
 * Relações da tabela translations_languages
 */
export const translationsLanguagesRelations = relations(
  translationsLanguages,
  ({ one }) => ({
    translation: one(translations, {
      fields: [translationsLanguages.id_translations],
      references: [translations.id],
    }),
    locale: one(locales, {
      fields: [translationsLanguages.id_locale_code],
      references: [locales.id],
    }),
  })
);
