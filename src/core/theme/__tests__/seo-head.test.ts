import { describe, it, expect } from "vitest";
import { resolveThemeSeoContext } from "../seo-head.ts";

const canonical = "http://localhost:8787/";
const siteName = "Demo Site";
const siteDescription = "Site tagline";

describe("resolveThemeSeoContext", () => {
  it("uses site name on home with home_list_posts", () => {
    const seo = resolveThemeSeoContext({
      resolvedKind: "home",
      isArchiveRoute: false,
      archiveTitle: "Blog",
      homeListPosts: true,
      siteName,
      siteDescription,
      canonicalUrl: canonical,
    });
    expect(seo.title).toBe(siteName);
    expect(seo.site_name).toBe(siteName);
    expect(seo.description).toBe(siteDescription);
  });

  it("uses home post title when home_content_key resolves", () => {
    const seo = resolveThemeSeoContext({
      resolvedKind: "home",
      isArchiveRoute: false,
      archiveTitle: "Blog",
      homeListPosts: false,
      seoPost: { title: "Welcome page", excerpt: "Intro" },
      siteName,
      siteDescription,
      canonicalUrl: canonical,
    });
    expect(seo.title).toBe("Welcome page");
  });

  it("falls back to site name on home without content post", () => {
    const seo = resolveThemeSeoContext({
      resolvedKind: "home",
      isArchiveRoute: false,
      archiveTitle: "Blog",
      homeListPosts: false,
      siteName,
      siteDescription,
      canonicalUrl: canonical,
    });
    expect(seo.title).toBe(siteName);
  });

  it("uses archive CPT name for archive routes", () => {
    const seo = resolveThemeSeoContext({
      resolvedKind: "archive",
      isArchiveRoute: true,
      archiveTitle: "Eventos",
      homeListPosts: false,
      seoPost: { title: "First listed post" },
      siteName,
      siteDescription,
      canonicalUrl: "http://localhost:8787/eventos",
    });
    expect(seo.title).toBe("Eventos");
  });

  it("uses current post for single routes", () => {
    const seo = resolveThemeSeoContext({
      resolvedKind: "single",
      isArchiveRoute: false,
      archiveTitle: "Blog",
      homeListPosts: false,
      seoPost: { title: "Article title", post_type_slug: "post" },
      siteName,
      siteDescription,
      canonicalUrl: "http://localhost:8787/article",
    });
    expect(seo.title).toBe("Article title");
    expect(seo.og_type).toBe("article");
  });
});
