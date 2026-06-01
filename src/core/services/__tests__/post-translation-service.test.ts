import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { describe, it, expect, beforeAll } from "vitest";
import {
  normalizeTranslationKey,
  buildTranslationPostCacheKey,
  TRANSLATION_KEY_META,
  resolveLocaleId,
  findPostByTranslationKey,
} from "../post-translation-service.ts";

describe("post-translation-service", () => {
  it("exports translation_key meta name", () => {
    expect(TRANSLATION_KEY_META).toBe("translation_key");
  });

  describe("normalizeTranslationKey", () => {
    it("accepts valid slug-like keys", () => {
      expect(normalizeTranslationKey("hello-world")).toBe("hello-world");
      expect(normalizeTranslationKey("  about-us  ")).toBe("about-us");
    });

    it("rejects empty or invalid keys", () => {
      expect(normalizeTranslationKey("")).toBeNull();
      expect(normalizeTranslationKey("   ")).toBeNull();
      expect(normalizeTranslationKey("bad slug")).toBeNull();
      expect(normalizeTranslationKey("../etc")).toBeNull();
    });
  });

  describe("buildTranslationPostCacheKey", () => {
    it("includes key, locale and status", () => {
      expect(buildTranslationPostCacheKey("hello-world", "pt-br", "published")).toBe(
        "post:tk:hello-world:locale=pt-br:status=published",
      );
    });
  });

  describe("locale resolution and translation lookup", () => {
    const client = createClient({ url: ":memory:" });
    const db = drizzle(client);

    beforeAll(async () => {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS edp_locales (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          language TEXT NOT NULL,
          hello_world TEXT NOT NULL,
          locale_code TEXT NOT NULL UNIQUE,
          country TEXT NOT NULL,
          timezone TEXT NOT NULL
        )
      `);

      await client.execute(`
        CREATE TABLE IF NOT EXISTS edp_posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          post_type_id INTEGER NOT NULL,
          parent_id INTEGER,
          author_id TEXT,
          id_locale_code INTEGER,
          title TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          excerpt TEXT,
          body TEXT,
          body_blocks TEXT,
          status TEXT NOT NULL,
          meta_values TEXT,
          published_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);

      await client.execute(`
        INSERT INTO edp_locales (language, hello_world, locale_code, country, timezone)
        VALUES
          ('Portuguese (Brazil)', 'Olá Mundo', 'pt_BR', 'Brazil', 'UTC-3'),
          ('Spanish (Spain)', 'Hola Mundo', 'es_ES', 'Spain', 'UTC+1')
      `);

      const now = Date.now();
      await client.execute(`
        INSERT INTO edp_posts (
          post_type_id, parent_id, author_id, id_locale_code, title, slug, excerpt, body, body_blocks, status, meta_values, published_at, created_at, updated_at
        )
        VALUES
          (1, NULL, NULL, 1, 'Olá Mundo', 'ola-mundo', NULL, NULL, NULL, 'published', '{"translation_key":"hello-world"}', ${now}, ${now}, ${now}),
          (1, NULL, NULL, 2, 'Hola Mundo', 'hola-mundo', NULL, NULL, NULL, 'published', '{"translation_key":"hello-world"}', ${now}, ${now}, ${now})
      `);
    });

    it("resolves locale id only for exact locale_code", async () => {
      await expect(resolveLocaleId("pt_BR", db)).resolves.toBe(1);
      await expect(resolveLocaleId("es_ES", db)).resolves.toBe(2);
      await expect(resolveLocaleId("pt-br", db)).resolves.toBeNull();
      await expect(resolveLocaleId("es", db)).resolves.toBeNull();
    });

    it("returns locale-specific post when locale_code matches", async () => {
      const post = await findPostByTranslationKey("hello-world", "es_ES", ["published"], db);
      expect(post).not.toBeNull();
      expect(post?.title).toBe("Hola Mundo");
      expect(post?.id_locale_code).toBe(2);
    });

    it("falls back when locale string does not match locale_code", async () => {
      const post = await findPostByTranslationKey("hello-world", "es", ["published"], db);
      expect(post).not.toBeNull();
      // Como "es" não corresponde a locale_code, busca cai no fallback "any".
      expect(post?.id_locale_code).toBe(1);
      expect(post?.title).toBe("Olá Mundo");
    });
  });
});
