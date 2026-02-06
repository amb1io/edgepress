import { index, int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { metaSchemaColumn } from "./meta_schema.ts";
import { posts } from "./post.ts";

/**
 * Tabela de tipos de posts
 * Define tipos customizados (post, page, attachment, etc)
 */
export const postTypes = sqliteTable(
  "post_types",
  {
    id: int().primaryKey({ autoIncrement: true }),
    slug: text().notNull().unique(),
    name: text().notNull(),
    meta_schema: metaSchemaColumn(),
    created_at: int(),
    updated_at: int(),
  },
  (table) => ({
    slugIdx: index("post_types_slug_idx").on(table.slug),
  })
);

/**
 * Relações da tabela post_types
 */
export const postTypeRelations = relations(postTypes, ({ many }) => ({
  posts: many(posts),
}));
