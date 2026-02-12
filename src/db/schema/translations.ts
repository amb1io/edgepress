import { index, int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { translationsLanguages } from "./translations_languages.ts";

/**
 * Tabela de traduções
 * Armazena chaves de tradução organizadas por namespace
 */
export const translations = sqliteTable(
  "translations",
  {
    id: int().primaryKey({ autoIncrement: true }),
    namespace: text("namespace").notNull(),
    key: text().notNull(),
    created_at: int("created_at"),
    updated_at: int("updated_at"),
  },
  (table) => ({
    namespaceIdx: index("translations_namespace_idx").on(table.namespace),
    keyIdx: index("translations_key_idx").on(table.key),
    namespaceKeyIdx: index("translations_namespace_key_idx").on(
      table.namespace,
      table.key
    ),
  })
);

/**
 * Relações da tabela translations
 */
export const translationsRelations = relations(translations, ({ many }) => ({
  translationsLanguages: many(translationsLanguages),
}));
