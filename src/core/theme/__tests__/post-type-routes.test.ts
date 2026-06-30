import { describe, it, expect } from "vitest";
import {
  buildArchivePublicPath,
  isArchivablePostTypeSlug,
  NON_ARCHIVABLE_POST_TYPE_SLUGS,
  resolveArchivePostTypeFromRoute,
  type ArchivablePostType,
} from "../post-type-routes.ts";
import type { ResolvedPublicRoute } from "../types.ts";

const archivableTypes: ArchivablePostType[] = [
  { slug: "post", name: "Post" },
  { slug: "blog", name: "Blog" },
  { slug: "eventos", name: "Eventos" },
  { slug: "produtos", name: "Produtos" },
];

describe("post-type-routes", () => {
  it("excludes internal post types from archivable checks via denylist constant", () => {
    expect(NON_ARCHIVABLE_POST_TYPE_SLUGS.has("page")).toBe(true);
    expect(NON_ARCHIVABLE_POST_TYPE_SLUGS.has("attachment")).toBe(true);
    expect(NON_ARCHIVABLE_POST_TYPE_SLUGS.has("post")).toBe(false);
  });

  it("detects archivable post type slugs", () => {
    expect(isArchivablePostTypeSlug("eventos", archivableTypes)).toBe(true);
    expect(isArchivablePostTypeSlug("page", archivableTypes)).toBe(false);
    expect(isArchivablePostTypeSlug("missing", archivableTypes)).toBe(false);
  });

  it("resolves archive from explicit archive route", () => {
    const route: ResolvedPublicRoute = {
      kind: "archive",
      locale: "pt-br",
      path: "/posts",
      postType: "post",
      page: 2,
    };
    expect(resolveArchivePostTypeFromRoute(route, archivableTypes)).toEqual({
      postType: "post",
      title: "Post",
    });
  });

  it("resolves archive from CPT slug route before singular lookup", () => {
    const route: ResolvedPublicRoute = {
      kind: "page",
      locale: "pt-br",
      path: "/produtos",
      slug: "produtos",
      page: 1,
    };
    expect(resolveArchivePostTypeFromRoute(route, archivableTypes)).toEqual({
      postType: "produtos",
      title: "Produtos",
    });
  });

  it("archive CPT slug wins over potential content slug collision", () => {
    const route: ResolvedPublicRoute = {
      kind: "page",
      locale: "pt-br",
      path: "/eventos",
      slug: "eventos",
    };
    const resolved = resolveArchivePostTypeFromRoute(route, archivableTypes);
    expect(resolved?.postType).toBe("eventos");
    expect(resolved?.title).toBe("Eventos");
  });

  it("resolves blog CPT archive from slug route", () => {
    const route: ResolvedPublicRoute = {
      kind: "page",
      locale: "pt-br",
      path: "/blog",
      slug: "blog",
      page: 1,
    };
    expect(resolveArchivePostTypeFromRoute(route, archivableTypes)).toEqual({
      postType: "blog",
      title: "Blog",
    });
  });

  it("returns null for non-archivable slug routes", () => {
    const route: ResolvedPublicRoute = {
      kind: "page",
      locale: "pt-br",
      path: "/sobre",
      slug: "sobre",
    };
    expect(resolveArchivePostTypeFromRoute(route, archivableTypes)).toBeNull();
  });

  it("builds public archive paths", () => {
    expect(buildArchivePublicPath("post", "")).toBe("/posts");
    expect(buildArchivePublicPath("post", "/en")).toBe("/en/posts");
    expect(buildArchivePublicPath("eventos", "")).toBe("/eventos");
    expect(buildArchivePublicPath("eventos", "/en")).toBe("/en/eventos");
  });
});
