import { index, int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { translationsLanguages } from "./translations_languages.ts";

/**
 * Tabela de locales
 * Armazena informações sobre idiomas, países e fusos horários
 */
export const locales = sqliteTable(
  "locales",
  {
    id: int().primaryKey({ autoIncrement: true }),
    language: text().notNull(),
    hello_world: text().notNull(),
    locale_code: text().notNull().unique(),
    country: text().notNull(),
    timezone: text().notNull(),
  },
  (table) => ({
    localeCodeIdx: index("locales_locale_code_idx").on(table.locale_code),
    languageIdx: index("locales_language_idx").on(table.language),
  })
);

/**
 * Relações da tabela locales
 * Nota: A relação com posts é definida em post.ts para evitar imports circulares
 */
export const localesRelations = relations(locales, ({ many }) => ({
  translationsLanguages: many(translationsLanguages),
}));
