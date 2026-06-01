import { describe, it, expect } from "vitest";
import {
  buildPublicPostPath,
  resolveSitemapLoc,
  normalizeSiteOrigin,
  shouldExcludeSitemapPage,
  buildSitemapXml,
} from "../sitemap-service.ts";

describe("sitemap-service", () => {
  describe("normalizeSiteOrigin", () => {
    it("removes trailing slash", () => {
      expect(normalizeSiteOrigin("https://example.com/")).toBe("https://example.com");
    });
  });

  describe("buildPublicPostPath", () => {
    it("prefixes slug with slash", () => {
      expect(buildPublicPostPath("my-post")).toBe("/my-post");
    });

    it("returns root for empty slug", () => {
      expect(buildPublicPostPath("")).toBe("/");
    });
  });

  describe("resolveSitemapLoc", () => {
    it("uses absolute canonical when provided", () => {
      expect(
        resolveSitemapLoc(
          "https://site.com",
          "/my-post",
          "https://canonical.example/page",
        ),
      ).toBe("https://canonical.example/page");
    });

    it("builds loc from origin and public path", () => {
      expect(resolveSitemapLoc("https://site.com", "/my-post", "my-post")).toBe(
        "https://site.com/my-post",
      );
    });

    it("returns path only when origin is empty", () => {
      expect(resolveSitemapLoc("", "/my-post")).toBe("/my-post");
    });
  });

  describe("shouldExcludeSitemapPage", () => {
    it("excludes admin and api routes", () => {
      expect(shouldExcludeSitemapPage("https://example.com/admin/pt-br")).toBe(true);
      expect(shouldExcludeSitemapPage("https://example.com/api/posts")).toBe(true);
      expect(shouldExcludeSitemapPage("https://example.com/themes/2026")).toBe(true);
    });

    it("allows public paths", () => {
      expect(shouldExcludeSitemapPage("https://example.com/posts")).toBe(false);
      expect(shouldExcludeSitemapPage("https://example.com/my-post")).toBe(false);
    });
  });

  describe("buildSitemapXml", () => {
    it("generates valid urlset", () => {
      const xml = buildSitemapXml([
        { loc: "https://example.com/", lastmod: "2024-01-01T00:00:00.000Z" },
        { loc: "https://example.com/posts" },
      ]);
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain("<loc>https://example.com/</loc>");
      expect(xml).toContain("<lastmod>2024-01-01T00:00:00.000Z</lastmod>");
      expect(xml).toContain("<loc>https://example.com/posts</loc>");
    });
  });
});
