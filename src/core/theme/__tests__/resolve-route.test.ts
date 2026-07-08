import { describe, it, expect } from "vitest";
import { resolvePreRoute } from "../resolve-route.ts";
import { resolveRouteKind } from "../resolve-route-kind.ts";
import { resolveThemeRoute } from "../resolve-theme-route.ts";
import type { RouteKindResolverDeps } from "../resolve-route-kind.ts";

const themeTemplates = [
  "index",
  "search",
  "404",
  "posts/index",
  "category/[slug]",
  "trabalhos/index",
  "trabalhos/[categorias]",
  "portfolio/[slug]",
  "[slug]",
];

function mockDeps(overrides: Partial<RouteKindResolverDeps> = {}): RouteKindResolverDeps {
  return {
    archivablePostTypes: [{ slug: "post", name: "Post" }],
    taxonomyTypes: ["category", "tag", "categorias"],
    resolvePostBySlug: async (slug) =>
      slug === "trabalhos" || slug === "jobs" ? { post_type_slug: "page" } : null,
    resolveTaxonomyTerm: async (type, slug) =>
      type === "category" && slug === "visum" ? { slug: "visum" } : null,
    ...overrides,
  };
}

describe("resolvePreRoute", () => {
  it("matches home index", () => {
    const pre = resolvePreRoute("/", new URLSearchParams(), themeTemplates);
    expect(pre.matched?.templateKey).toBe("index");
    expect(pre.locale).toBe("pt-br");
  });

  it("matches posts archive template", () => {
    const pre = resolvePreRoute("/posts", new URLSearchParams(), themeTemplates);
    expect(pre.matched?.templateKey).toBe("posts/index");
  });

  it("matches trabalhos routes", () => {
    expect(
      resolvePreRoute("/trabalhos", new URLSearchParams(), themeTemplates).matched?.templateKey,
    ).toBe("trabalhos/index");
    expect(
      resolvePreRoute("/trabalhos/publicidade", new URLSearchParams(), themeTemplates).matched,
    ).toEqual({
      templateKey: "trabalhos/[categorias]",
      params: { categorias: "publicidade" },
      staticSegments: ["trabalhos"],
    });
  });

  it("matches search route", () => {
    const pre = resolvePreRoute("/search", new URLSearchParams("q=foo&page=2"), themeTemplates);
    expect(pre.matched?.templateKey).toBe("search");
    expect(pre.searchQuery).toBe("foo");
    expect(pre.page).toBe(2);
  });
});

describe("resolveThemeRoute", () => {
  it("resolves home", async () => {
    const route = await resolveThemeRoute("/", new URLSearchParams(), themeTemplates, mockDeps());
    expect(route).toMatchObject({
      kind: "home",
      templateKey: "index",
      locale: "pt-br",
      path: "/",
    });
  });

  it("resolves post archive at /posts", async () => {
    const route = await resolveThemeRoute("/posts", new URLSearchParams(), themeTemplates, mockDeps());
    expect(route).toMatchObject({
      kind: "archive",
      templateKey: "posts/index",
      postType: "post",
    });
  });

  it("resolves taxonomy archive at /category/{slug}", async () => {
    const route = await resolveThemeRoute(
      "/category/visum",
      new URLSearchParams(),
      themeTemplates,
      mockDeps(),
    );
    expect(route).toMatchObject({
      kind: "taxonomy",
      templateKey: "category/[slug]",
      taxonomyType: "category",
      taxonomySlug: "visum",
      params: { slug: "visum" },
    });
  });

  it("resolves trabalhos page with category param", async () => {
    const route = await resolveThemeRoute(
      "/trabalhos/publicidade",
      new URLSearchParams(),
      themeTemplates,
      mockDeps({
        resolveTaxonomyTerm: async () => null,
      }),
    );
    expect(route).toMatchObject({
      kind: "page",
      templateKey: "trabalhos/[categorias]",
      slug: "trabalhos",
      params: { categorias: "publicidade" },
    });
  });

  it("resolves portfolio job detail at /portfolio/{slug}", async () => {
    const route = await resolveThemeRoute(
      "/portfolio/marketing-day-nem-te-conto-com-luana-piovani-audible",
      new URLSearchParams(),
      themeTemplates,
      mockDeps({
        resolvePostBySlug: async (slug) =>
          slug === "marketing-day-nem-te-conto-com-luana-piovani-audible"
            ? { post_type_slug: "jobs" }
            : null,
      }),
    );
    expect(route).toMatchObject({
      kind: "page",
      templateKey: "portfolio/[slug]",
      slug: "marketing-day-nem-te-conto-com-luana-piovani-audible",
      params: { slug: "marketing-day-nem-te-conto-com-luana-piovani-audible" },
    });
  });

  it("returns 404 for nested prefix when dynamic slug post is missing", async () => {
    const route = await resolveThemeRoute(
      "/portfolio/missing-job",
      new URLSearchParams(),
      themeTemplates,
      mockDeps({
        resolvePostBySlug: async () => null,
      }),
    );
    expect(route.kind).toBe("404");
    expect(route.templateKey).toBe("404");
  });

  it("returns 404 when no template matches", async () => {
    const route = await resolveThemeRoute(
      "/missing/path",
      new URLSearchParams(),
      themeTemplates,
      mockDeps(),
    );
    expect(route.kind).toBe("404");
    expect(route.templateKey).toBe("404");
  });
});

describe("resolveRouteKind", () => {
  it("classifies taxonomy when base segment is a taxonomy type", async () => {
    const resolved = await resolveRouteKind(
      {
        templateKey: "category/[slug]",
        params: { slug: "visum" },
        staticSegments: ["category"],
      },
      mockDeps(),
    );
    expect(resolved.kind).toBe("taxonomy");
    expect(resolved.taxonomyType).toBe("category");
  });
});
