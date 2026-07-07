import { describe, it, expect } from "vitest";
import { buildLocaleSwitcher, buildLocaleSwitcherUrl } from "../locale-switcher.ts";
import type { ResolvedPublicRoute } from "../types.ts";

const baseFields = { templateKey: "index", params: {} };

describe("locale-switcher", () => {
  it("builds home URLs without translation slugs", async () => {
    const route: ResolvedPublicRoute = { kind: "home", locale: "pt-br", path: "/", ...baseFields };
    expect(await buildLocaleSwitcherUrl("pt-br", route, "home")).toBe("/");
    expect(await buildLocaleSwitcherUrl("en", route, "home")).toBe("/en");
    expect(await buildLocaleSwitcher("pt-br", route, "home")).toEqual([
      { code: "pt-br", flag: "🇧🇷", label: "PT", url: "/", active: true },
      { code: "en", flag: "🇺🇸", label: "EN", url: "/en", active: false },
    ]);
  });

  it("keeps the current slug across locales for singular routes", async () => {
    const route: ResolvedPublicRoute = {
      kind: "page",
      locale: "pt-br",
      path: "/hello-world",
      slug: "hello-world",
      templateKey: "[slug]",
      params: { slug: "hello-world" },
    };
    expect(await buildLocaleSwitcherUrl("pt-br", route, "single")).toBe("/hello-world");
    expect(await buildLocaleSwitcherUrl("en", route, "single")).toBe("/en/hello-world");
  });

  it("builds post archive URLs", async () => {
    const route: ResolvedPublicRoute = {
      kind: "archive",
      locale: "pt-br",
      path: "/posts",
      postType: "post",
      page: 1,
      templateKey: "posts/index",
      params: {},
    };
    expect(await buildLocaleSwitcherUrl("pt-br", route, "archive", { archivePostType: "post" })).toBe(
      "/posts",
    );
    expect(await buildLocaleSwitcherUrl("en", route, "archive", { archivePostType: "post" })).toBe(
      "/en/posts",
    );
  });

  it("builds CPT archive URLs", async () => {
    const route: ResolvedPublicRoute = {
      kind: "archive",
      locale: "en",
      path: "/en/eventos",
      postType: "eventos",
      page: 1,
      templateKey: "eventos/index",
      params: {},
    };
    expect(await buildLocaleSwitcherUrl("pt-br", route, "archive", { archivePostType: "eventos" })).toBe(
      "/eventos",
    );
    expect(await buildLocaleSwitcherUrl("en", route, "archive", { archivePostType: "eventos" })).toBe(
      "/en/eventos",
    );
  });

  it("falls back to locale home for 404 without slug", async () => {
    const route: ResolvedPublicRoute = {
      kind: "404",
      locale: "en",
      path: "/en",
      templateKey: "404",
      params: {},
    };
    expect(await buildLocaleSwitcherUrl("pt-br", route, "404")).toBe("/");
    expect(await buildLocaleSwitcherUrl("en", route, "404")).toBe("/en");
  });

  it("preserves slug path for 404 with slug", async () => {
    const route: ResolvedPublicRoute = {
      kind: "404",
      locale: "pt-br",
      path: "/missing",
      slug: "missing",
      templateKey: "404",
      params: {},
    };
    expect(await buildLocaleSwitcherUrl("en", route, "404")).toBe("/en/missing");
  });

  it("builds taxonomy archive URLs", async () => {
    const route: ResolvedPublicRoute = {
      kind: "taxonomy",
      locale: "pt-br",
      path: "/category/visum",
      page: 1,
      templateKey: "category/[slug]",
      params: { slug: "visum" },
      taxonomyType: "category",
      taxonomySlug: "visum",
    };
    expect(await buildLocaleSwitcherUrl("pt-br", route, "taxonomy")).toBe("/category/visum");
    expect(await buildLocaleSwitcherUrl("en", route, "taxonomy")).toBe("/en/category/visum");
  });
});
