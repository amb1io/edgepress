import { describe, it, expect } from "vitest";
import {
  extractSeoFromCustomFields,
  resolveSeoValues,
  resolveCanonicalUrl,
  buildSeoApiPayload,
} from "../seo-metadata-service.ts";

describe("seo-metadata-service", () => {
  const postContext = {
    title: "Post Title",
    excerpt: "Post excerpt here",
    slug: "my-post",
  };

  describe("extractSeoFromCustomFields", () => {
    it("returns empty when no SEO block", () => {
      const result = extractSeoFromCustomFields([
        { title: "Other", rows: [{ name: "x", value: "y" }] },
      ]);
      expect(result).toEqual({
        seo_title: "",
        seo_description: "",
        seo_canonical: "",
      });
    });

    it("extracts values from SEO block by Portuguese labels", () => {
      const result = extractSeoFromCustomFields([
        {
          title: "SEO",
          rows: [
            { name: "Título SEO", value: "Custom Title" },
            { name: "Descrição SEO", value: "Custom desc" },
            { name: "URL Canônica", value: "custom-slug" },
          ],
        },
      ]);
      expect(result).toEqual({
        seo_title: "Custom Title",
        seo_description: "Custom desc",
        seo_canonical: "custom-slug",
      });
    });

    it("matches SEO block case-insensitively", () => {
      const result = extractSeoFromCustomFields([
        {
          title: "seo",
          rows: [{ name: "seo_title", value: "T" }],
        },
      ]);
      expect(result.seo_title).toBe("T");
    });
  });

  describe("resolveSeoValues", () => {
    it("applies fallbacks from post when fields are empty", () => {
      const result = resolveSeoValues(
        { seo_title: "", seo_description: "", seo_canonical: "" },
        postContext,
      );
      expect(result).toEqual({
        seo_title: "Post Title",
        seo_description: "Post excerpt here",
        seo_canonical: "my-post",
      });
    });

    it("keeps custom values when provided", () => {
      const result = resolveSeoValues(
        {
          seo_title: "SEO Title",
          seo_description: "SEO Desc",
          seo_canonical: "seo-slug",
        },
        postContext,
      );
      expect(result.seo_title).toBe("SEO Title");
      expect(result.seo_description).toBe("SEO Desc");
      expect(result.seo_canonical).toBe("seo-slug");
    });
  });

  describe("resolveCanonicalUrl", () => {
    it("returns absolute URL unchanged", () => {
      expect(
        resolveCanonicalUrl("https://example.com/page", "https://site.com", "slug"),
      ).toBe("https://example.com/page");
    });

    it("builds URL from base and slug", () => {
      expect(resolveCanonicalUrl("my-post", "https://site.com", "my-post")).toBe(
        "https://site.com/my-post",
      );
    });

    it("handles path starting with slash", () => {
      expect(resolveCanonicalUrl("/themes/2026/post", "https://site.com", "post")).toBe(
        "https://site.com/themes/2026/post",
      );
    });

    it("returns slug when no base and relative canonical", () => {
      expect(resolveCanonicalUrl("my-post", undefined, "my-post")).toBe("/my-post");
    });
  });

  describe("buildSeoApiPayload", () => {
    it("builds API payload with resolved canonical", () => {
      const payload = buildSeoApiPayload(
        {
          seo_title: "T",
          seo_description: "D",
          seo_canonical: "slug",
        },
        "https://example.com",
        "slug",
      );
      expect(payload).toEqual({
        title: "T",
        description: "D",
        canonical_slug: "slug",
        canonical: "https://example.com/slug",
      });
    });

    it("returns null when row is null", () => {
      expect(buildSeoApiPayload(null)).toBeNull();
    });
  });
});
