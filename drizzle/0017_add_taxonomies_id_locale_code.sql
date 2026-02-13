-- Add id_locale_code foreign key to taxonomies table
ALTER TABLE "taxonomies" ADD COLUMN "id_locale_code" INTEGER REFERENCES "locales"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "taxonomies_id_locale_code_idx" ON "taxonomies" ("id_locale_code");
