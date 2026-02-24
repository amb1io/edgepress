-- Add 'trash' to posts.status allowed values
-- SQLite does not support ALTER COLUMN to change CHECK, so we recreate the table.

CREATE TABLE "posts_new" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "post_type_id" INTEGER NOT NULL REFERENCES "post_types"("id") ON DELETE RESTRICT,
  "parent_id" INTEGER,
  "author_id" TEXT REFERENCES "user"("id") ON DELETE SET NULL,
  "id_locale_code" INTEGER REFERENCES "locales"("id") ON DELETE SET NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "excerpt" TEXT,
  "body" TEXT,
  "status" TEXT DEFAULT 'draft' CHECK ("status" IN ('published', 'draft', 'archived', 'trash')),
  "meta_values" TEXT,
  "published_at" INTEGER,
  "created_at" INTEGER,
  "updated_at" INTEGER
);

INSERT INTO "posts_new" (
  "id",
  "post_type_id",
  "parent_id",
  "author_id",
  "id_locale_code",
  "title",
  "slug",
  "excerpt",
  "body",
  "status",
  "meta_values",
  "published_at",
  "created_at",
  "updated_at"
)
SELECT
  "id",
  "post_type_id",
  "parent_id",
  "author_id",
  "id_locale_code",
  "title",
  "slug",
  "excerpt",
  "body",
  "status",
  "meta_values",
  "published_at",
  "created_at",
  "updated_at"
FROM "posts";

DROP TABLE "posts";

ALTER TABLE "posts_new" RENAME TO "posts";

CREATE UNIQUE INDEX "posts_slug_unique" ON "posts" ("slug");
CREATE INDEX "posts_post_type_id_idx" ON "posts" ("post_type_id");
CREATE INDEX "posts_parent_id_idx" ON "posts" ("parent_id");
CREATE INDEX "posts_author_id_idx" ON "posts" ("author_id");
CREATE INDEX "posts_id_locale_code_idx" ON "posts" ("id_locale_code");
CREATE INDEX "posts_status_idx" ON "posts" ("status");
CREATE INDEX "posts_created_at_idx" ON "posts" ("created_at");
CREATE INDEX "posts_updated_at_idx" ON "posts" ("updated_at");
CREATE INDEX "posts_slug_idx" ON "posts" ("slug");
