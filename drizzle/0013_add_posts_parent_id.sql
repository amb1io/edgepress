-- Add parent_id to posts (self-reference for hierarchy)
ALTER TABLE "posts" ADD COLUMN "parent_id" INTEGER REFERENCES "posts"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "posts_parent_id_idx" ON "posts" ("parent_id");
