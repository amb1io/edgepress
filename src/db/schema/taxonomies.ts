import { index, int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { postsTaxonomies } from "./posts_taxonomies.ts";
import { locales } from "./locales.ts";

/**
 * Tabela de taxonomias
 * Armazena categorias, tags e outras taxonomias hierárquicas
 */
export const taxonomies = sqliteTable(
  "taxonomies",
  {
    id: int().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    slug: text().notNull(),
    description: text(),
    type: text().notNull(),
    parent_id: int("parent_id").references(() => taxonomies.id, { onDelete: "set null" }),
    id_locale_code: int("id_locale_code").references(() => locales.id, { onDelete: "set null" }),
    created_at: int(),
    updated_at: int(),
  },
  (table) => ({
    typeIdx: index("taxonomies_type_idx").on(table.type),
    parentIdIdx: index("taxonomies_parent_id_idx").on(table.parent_id),
    slugIdx: index("taxonomies_slug_idx").on(table.slug),
    idLocaleCodeIdx: index("taxonomies_id_locale_code_idx").on(table.id_locale_code),
    typeSlugIdx: uniqueIndex("taxonomies_type_slug_idx").on(table.type, table.slug),
  })
);

/**
 * Relações da tabela taxonomies
 */
export const taxonomyRelations = relations(taxonomies, ({ one, many }) => ({
  parent: one(taxonomies, {
    fields: [taxonomies.parent_id],
    references: [taxonomies.id],
    relationName: "taxonomy_hierarchy",
  }),
  children: many(taxonomies, {
    relationName: "taxonomy_hierarchy",
  }),
  locale: one(locales),
  postsTaxonomies: many(postsTaxonomies),
}));
