import { describe, it, expect } from "vitest";
import {
  stripHtml,
  buildBreadcrumbListJsonLd,
  buildArticleJsonLd,
  buildWebPageJsonLd,
  buildWebSiteJsonLd,
} from "../json-ld-service.ts";
import type { JsonLdPostInput, JsonLdBuildContext } from "../json-ld-service.ts";

const origin = "https://example.com";

const basePost: JsonLdPostInput = {
  id: 1,
  title: "Meu post",
  slug: "meu-post",
  excerpt: "Resumo do post",
  body: "<p>Corpo</p>",
  author_id: "user-1",
  parent_id: null,
  published_at: 1_700_000_000_000,
  created_at: 1_700_000_000_000,
  updated_at: 1_700_000_100_000,
  meta_values: {},
};

const baseContext: JsonLdBuildContext = {
  post_type_slug: "post",
  seo: {
    title: "SEO Title",
    description: "SEO Description",
    canonical_slug: "meu-post",
    canonical: "https://example.com/meu-post",
  },
  origin,
  site_name: "demo site",
  site_description: "Site desc",
  author_name: "Autor Teste",
};

describe("json-ld-service", () => {
  describe("stripHtml", () => {
    it("removes HTML tags", () => {
      expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
    });
  });

  describe("buildBreadcrumbListJsonLd", () => {
    it("builds post breadcrumb with Posts archive", () => {
      const graph = buildBreadcrumbListJsonLd(basePost, baseContext);
      expect(graph?.["@type"]).toBe("BreadcrumbList");
      const items = graph?.itemListElement as Record<string, unknown>[];
      expect(items).toHaveLength(3);
      expect(items[0]).toMatchObject({ position: 1, name: "demo site" });
      expect(items[1]).toMatchObject({ position: 2, name: "Posts" });
      expect(items[2]).toMatchObject({ position: 3, name: "Meu post" });
    });

    it("builds page breadcrumb with ancestors", () => {
      const graph = buildBreadcrumbListJsonLd(
        { ...basePost, title: "Subpage", slug: "subpage" },
        { ...baseContext, post_type_slug: "page", seo: null },
        [{ title: "Parent Page", slug: "parent-page" }],
      );
      const items = graph?.itemListElement as Record<string, unknown>[];
      expect(items).toHaveLength(3);
      expect(items[1]).toMatchObject({ name: "Parent Page" });
      expect(items[2]).toMatchObject({ name: "Subpage" });
    });

    it("returns null without origin", () => {
      expect(buildBreadcrumbListJsonLd(basePost, { ...baseContext, origin: "" })).toBeNull();
    });
  });

  describe("buildArticleJsonLd", () => {
    it("builds Article with author and dates", () => {
      const graph = buildArticleJsonLd(basePost, baseContext);
      expect(graph?.["@type"]).toBe("Article");
      expect(graph?.headline).toBe("SEO Title");
      expect(graph?.url).toBe("https://example.com/meu-post");
      expect(graph?.author).toEqual({ "@type": "Person", name: "Autor Teste" });
      expect(graph?.publisher).toEqual({ "@type": "Organization", name: "demo site" });
    });
  });

  describe("buildWebPageJsonLd", () => {
    it("builds WebPage with isPartOf WebSite", () => {
      const graph = buildWebPageJsonLd(basePost, {
        ...baseContext,
        post_type_slug: "page",
      });
      expect(graph?.["@type"]).toBe("WebPage");
      expect(graph?.isPartOf).toMatchObject({
        "@type": "WebSite",
        name: "demo site",
        url: origin,
      });
    });
  });

  describe("buildWebSiteJsonLd", () => {
    it("returns empty without baseUrl", async () => {
      const graphs = await buildWebSiteJsonLd({} as never, "");
      expect(graphs).toEqual([]);
    });
  });
});
