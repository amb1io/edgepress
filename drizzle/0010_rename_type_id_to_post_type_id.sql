-- Rename posts.type_id to post_type_id
-- Drop index if it exists (e.g. from 0011_add_indexes applied in wrong order) to avoid
-- "no such column: post_type_id" when SQLite rebuilds the table during RENAME COLUMN
DROP INDEX IF EXISTS "posts_post_type_id_idx";
ALTER TABLE "posts" RENAME COLUMN "type_id" TO "post_type_id";
CREATE INDEX IF NOT EXISTS "posts_post_type_id_idx" ON "posts" ("post_type_id");
