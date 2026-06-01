import { index, int, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";
import { prefixedTable } from "../table-prefix.ts";
import { posts } from "./post.ts";

/**
 * SEO metadata por post (1:1).
 * Valores denormalizados no save; fallbacks aplicados quando campos SEO estão vazios.
 */
export const seoMetadata = sqliteTable(
  prefixedTable("seo_metadata"),
  {
    id: int().primaryKey({ autoIncrement: true }),
    post_id: int("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    seo_title: text("seo_title"),
    seo_description: text("seo_description"),
    seo_canonical: text("seo_canonical"),
    created_at: int("created_at"),
    updated_at: int("updated_at"),
  },
  (table) => ({
    postIdUnique: uniqueIndex("seo_metadata_post_id_unique").on(table.post_id),
    postIdIdx: index("seo_metadata_post_id_idx").on(table.post_id),
  }),
);

export const seoMetadataRelations = relations(seoMetadata, ({ one }) => ({
  post: one(posts, {
    fields: [seoMetadata.post_id],
    references: [posts.id],
  }),
}));
