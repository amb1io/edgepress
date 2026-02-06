import { index, int, primaryKey, sqliteTable } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { posts } from "./post.ts";

/**
 * Tabela de relacionamento posts-media
 * Relaciona posts com attachments (media são posts do tipo "attachment")
 */
export const postsMedia = sqliteTable(
  "posts_media",
  {
    post_id: int("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    media_id: int("media_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.post_id, table.media_id] }),
    postIdIdx: index("posts_media_post_id_idx").on(table.post_id),
    mediaIdIdx: index("posts_media_media_id_idx").on(table.media_id),
  })
);

/**
 * Relações da tabela posts_media
 */
export const postsMediaRelations = relations(postsMedia, ({ one }) => ({
  post: one(posts, {
    fields: [postsMedia.post_id],
    references: [posts.id],
    relationName: "post_media",
  }),
  media: one(posts, {
    fields: [postsMedia.media_id],
    references: [posts.id],
    relationName: "media_post",
  }),
}));
