-- 1) Rename posts.type_id to post_type_id (must run before indexes on post_type_id)
ALTER TABLE "posts" RENAME COLUMN "type_id" TO "post_type_id";
--> statement-breakpoint
-- 2) Add indexes
CREATE INDEX IF NOT EXISTS "posts_post_type_id_idx" ON "posts" ("post_type_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_author_id_idx" ON "posts" ("author_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_status_idx" ON "posts" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_created_at_idx" ON "posts" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_updated_at_idx" ON "posts" ("updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_slug_idx" ON "posts" ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "post_types_slug_idx" ON "post_types" ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "taxonomies_type_idx" ON "taxonomies" ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "taxonomies_parent_id_idx" ON "taxonomies" ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "taxonomies_slug_idx" ON "taxonomies" ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "taxonomies_type_slug_idx" ON "taxonomies" ("type", "slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_taxonomies_post_id_idx" ON "posts_taxonomies" ("post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_taxonomies_term_id_idx" ON "posts_taxonomies" ("term_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_media_post_id_idx" ON "posts_media" ("post_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_media_media_id_idx" ON "posts_media" ("media_id");
