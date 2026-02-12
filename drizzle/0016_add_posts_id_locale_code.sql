-- Add id_locale_code foreign key to posts table
ALTER TABLE "posts" ADD COLUMN "id_locale_code" INTEGER REFERENCES "locales"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "posts_id_locale_code_idx" ON "posts" ("id_locale_code");
