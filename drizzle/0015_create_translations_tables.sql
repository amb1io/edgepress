-- Create translations table
CREATE TABLE IF NOT EXISTS "translations" (
	"id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
	"namespace" TEXT NOT NULL,
	"key" TEXT NOT NULL,
	"created_at" INTEGER,
	"updated_at" INTEGER
);
CREATE INDEX IF NOT EXISTS "translations_namespace_idx" ON "translations" ("namespace");
CREATE INDEX IF NOT EXISTS "translations_key_idx" ON "translations" ("key");
CREATE INDEX IF NOT EXISTS "translations_namespace_key_idx" ON "translations" ("namespace", "key");

-- Create translations_languages table
CREATE TABLE IF NOT EXISTS "translations_languages" (
	"id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
	"id_translations" INTEGER NOT NULL REFERENCES "translations"("id") ON DELETE CASCADE,
	"id_locale_code" INTEGER NOT NULL REFERENCES "locales"("id") ON DELETE CASCADE,
	"value" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "translations_languages_id_translations_idx" ON "translations_languages" ("id_translations");
CREATE INDEX IF NOT EXISTS "translations_languages_id_locale_code_idx" ON "translations_languages" ("id_locale_code");
CREATE INDEX IF NOT EXISTS "translations_languages_translations_locale_idx" ON "translations_languages" ("id_translations", "id_locale_code");
CREATE UNIQUE INDEX IF NOT EXISTS "translations_languages_unique_translation_locale" ON "translations_languages" ("id_translations", "id_locale_code");
