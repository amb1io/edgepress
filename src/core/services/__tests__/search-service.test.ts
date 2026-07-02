import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { describe, it, expect, beforeAll } from "vitest";
import {
  isSearchablePostType,
  sanitizeFtsQuery,
  buildBodySearchText,
  syncPostSearchIndex,
  searchPosts,
  removePostFromSearchIndex,
} from "../search-service.ts";
import type { Database } from "../../../utils/types/database.ts";

describe("search-service", () => {
  describe("isSearchablePostType", () => {
    it("includes post, page and custom user types", () => {
      expect(isSearchablePostType("post")).toBe(true);
      expect(isSearchablePostType("page")).toBe(true);
      expect(isSearchablePostType("job")).toBe(true);
    });

    it("excludes system types", () => {
      expect(isSearchablePostType("attachment")).toBe(false);
      expect(isSearchablePostType("custom_fields")).toBe(false);
      expect(isSearchablePostType("themes")).toBe(false);
    });
  });

  describe("sanitizeFtsQuery", () => {
    it("wraps tokens in quotes", () => {
      expect(sanitizeFtsQuery("hello world")).toBe('"hello" "world"');
    });

    it("escapes double quotes inside tokens", () => {
      expect(sanitizeFtsQuery('say "hi"')).toBe('"say" """hi"""');
    });

    it("returns null for empty input", () => {
      expect(sanitizeFtsQuery("   ")).toBeNull();
    });
  });

  describe("buildBodySearchText", () => {
    it("concatenates HTML body and body_blocks text", () => {
      const blocks = JSON.stringify([
        { content: [{ text: "BlockNote paragraph" }] },
      ]);
      const result = buildBodySearchText("<p>HTML body</p>", blocks);
      expect(result).toContain("HTML body");
      expect(result).toContain("BlockNote paragraph");
    });

    it("uses only available sources", () => {
      expect(buildBodySearchText("<p>Only HTML</p>", null)).toBe("Only HTML");
      const blocks = JSON.stringify([{ content: [{ text: "Only blocks" }] }]);
      expect(buildBodySearchText(null, blocks)).toBe("Only blocks");
    });
  });

  describe("FTS integration", () => {
    const client = createClient({ url: ":memory:" });
    const db = drizzle(client) as unknown as Database;

    beforeAll(async () => {
      await client.execute(`
        CREATE TABLE edp_locales (
          id INTEGER PRIMARY KEY,
          language TEXT NOT NULL,
          hello_world TEXT NOT NULL,
          locale_code TEXT NOT NULL UNIQUE,
          country TEXT NOT NULL,
          timezone TEXT NOT NULL
        )
      `);
      await client.execute(`
        INSERT INTO edp_locales (id, language, hello_world, locale_code, country, timezone)
        VALUES (1, 'Portuguese (Brazil)', 'Olá Mundo', 'pt_BR', 'Brazil', 'UTC-3')
      `);
      await client.execute(`
        CREATE TABLE edp_post_types (
          id INTEGER PRIMARY KEY,
          slug TEXT NOT NULL,
          name TEXT NOT NULL
        )
      `);
      await client.execute(`
        CREATE TABLE edp_posts (
          id INTEGER PRIMARY KEY,
          post_type_id INTEGER NOT NULL,
          parent_id INTEGER,
          author_id TEXT,
          title TEXT NOT NULL,
          slug TEXT NOT NULL,
          excerpt TEXT,
          body TEXT,
          body_blocks TEXT,
          status TEXT NOT NULL,
          meta_values TEXT,
          published_at INTEGER,
          created_at INTEGER,
          updated_at INTEGER,
          id_locale_code INTEGER
        )
      `);
      await client.execute(`
        CREATE TABLE edp_taxonomies (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT NOT NULL,
          description TEXT,
          type TEXT NOT NULL,
          parent_id INTEGER,
          id_locale_code INTEGER,
          created_at INTEGER,
          updated_at INTEGER
        )
      `);
      await client.execute(`
        CREATE TABLE edp_posts_taxonomies (
          post_id INTEGER NOT NULL,
          term_id INTEGER NOT NULL
        )
      `);
      await client.execute(`
        CREATE VIRTUAL TABLE edp_posts_fts USING fts5(
          post_id UNINDEXED,
          post_type_id UNINDEXED,
          status UNINDEXED,
          id_locale_code UNINDEXED,
          title,
          body,
          taxonomy,
          custom_fields,
          tokenize='unicode61 remove_diacritics 2'
        )
      `);

      await client.execute(`INSERT INTO edp_post_types (id, slug, name) VALUES (1, 'post', 'Post')`);
      await client.execute(`
        INSERT INTO edp_posts (
          id, post_type_id, title, slug, body, body_blocks, status, id_locale_code, created_at, updated_at
        ) VALUES (
          1, 1, 'Cloudflare Workers', 'cloudflare-workers',
          '<p>Edge computing platform</p>', NULL, 'published', 1, 1, 1
        )
      `);
      await client.execute(`
        INSERT INTO edp_posts (
          id, post_type_id, title, slug, body, body_blocks, status, id_locale_code, created_at, updated_at
        ) VALUES (
          2, 1, 'Draft post', 'draft-post', 'secret', NULL, 'draft', 1, 1, 1
        )
      `);

      await syncPostSearchIndex(db, 1);
      await syncPostSearchIndex(db, 2);
    });

    it("finds published posts by title/body", async () => {
      const result = await searchPosts(db, { q: "cloudflare", localeId: 1 });
      expect(result?.total).toBe(1);
      expect(result?.hits[0]?.post_id).toBe(1);
    });

    it("does not return draft posts", async () => {
      const result = await searchPosts(db, { q: "secret", localeId: 1 });
      expect(result?.total).toBe(0);
    });

    it("removePostFromSearchIndex clears entry", async () => {
      await removePostFromSearchIndex(db, 1);
      const result = await searchPosts(db, { q: "cloudflare", localeId: 1 });
      expect(result?.total).toBe(0);
    });
  });
});
