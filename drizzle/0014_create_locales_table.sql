-- Create locales table
CREATE TABLE IF NOT EXISTS "locales" (
	"id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
	"language" TEXT NOT NULL,
	"hello_world" TEXT NOT NULL,
	"locale_code" TEXT NOT NULL UNIQUE,
	"country" TEXT NOT NULL,
	"timezone" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "locales_locale_code_idx" ON "locales" ("locale_code");
CREATE INDEX IF NOT EXISTS "locales_language_idx" ON "locales" ("language");
