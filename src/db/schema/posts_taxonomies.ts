import { index, int, primaryKey, sqliteTable } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { posts } from "./post.ts";
import { taxonomies } from "./taxonomies.ts";

/**
 * Tabela de relacionamento posts-taxonomias
 * Tabela pivot para relacionamento many-to-many entre posts e taxonomias
 */
export const postsTaxonomies = sqliteTable(
  "posts_taxonomies",
  {
    post_id: int("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    term_id: int("term_id")
      .notNull()
      .references(() => taxonomies.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.post_id, table.term_id] }),
    postIdIdx: index("posts_taxonomies_post_id_idx").on(table.post_id),
    termIdIdx: index("posts_taxonomies_term_id_idx").on(table.term_id),
  })
);

/**
 * Relações da tabela posts_taxonomies
 */
export const postsTaxonomiesRelations = relations(postsTaxonomies, ({ one }) => ({
  post: one(posts, {
    fields: [postsTaxonomies.post_id],
    references: [posts.id],
  }),
  taxonomy: one(taxonomies, {
    fields: [postsTaxonomies.term_id],
    references: [taxonomies.id],
  }),
}));
