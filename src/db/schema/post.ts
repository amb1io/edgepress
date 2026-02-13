import { index, int, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { postTypes } from "./post_type.ts";
import { user } from "./auth.ts";
import { locales } from "./locales.ts";

/**
 * Tabela de posts
 * Armazena conteúdo de diferentes tipos (post, page, attachment, etc)
 */
export const posts = sqliteTable(
  "posts",
  {
    id: int().primaryKey({ autoIncrement: true }),
    post_type_id: int("post_type_id")
      .notNull()
      .references(() => postTypes.id, { onDelete: "restrict" }),
    parent_id: int("parent_id").references(() => posts.id, { onDelete: "set null" }),
    author_id: text("author_id").references(() => user.id, { onDelete: "set null" }),
    id_locale_code: int("id_locale_code").references(() => locales.id, { onDelete: "set null" }),
    title: text().notNull(),
    slug: text().notNull().unique(),
    excerpt: text(),
    body: text(),
    status: text({ enum: ["published", "draft", "archived"] }).default("draft"),
    meta_values: text(),
    published_at: int(),
    created_at: int(),
    updated_at: int(),
  },
  (table) => ({
    postTypeIdIdx: index("posts_post_type_id_idx").on(table.post_type_id),
    parentIdIdx: index("posts_parent_id_idx").on(table.parent_id),
    authorIdIdx: index("posts_author_id_idx").on(table.author_id),
    localeCodeIdIdx: index("posts_id_locale_code_idx").on(table.id_locale_code),
    statusIdx: index("posts_status_idx").on(table.status),
    createdAtIdx: index("posts_created_at_idx").on(table.created_at),
    updatedAtIdx: index("posts_updated_at_idx").on(table.updated_at),
    slugIdx: index("posts_slug_idx").on(table.slug),
  })
);

/**
 * Relações da tabela posts
 * Nota: As relações para postsTaxonomies e postsMedia são definidas
 * nos respectivos arquivos para evitar imports circulares
 */
export const postRelations = relations(posts, ({ one, many }) => ({
  postType: one(postTypes, {
    fields: [posts.post_type_id],
    references: [postTypes.id],
  }),
  parent: one(posts, {
    fields: [posts.parent_id],
    references: [posts.id],
    relationName: "postHierarchy",
  }),
  children: many(posts, { relationName: "postHierarchy" }),
  author: one(user, {
    fields: [posts.author_id],
    references: [user.id],
  }),
  locale: one(locales, {
    fields: [posts.id_locale_code],
    references: [locales.id],
  }),
}));
