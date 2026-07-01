import { describe, it, expect } from "vitest";
import { buildLocaleSwitcher, buildLocaleSwitcherUrl } from "../locale-switcher.ts";
import type { ResolvedPublicRoute } from "../types.ts";

describe("locale-switcher", () => {
  it("builds home URLs without translation slugs", () => {
    const route: ResolvedPublicRoute = { kind: "home", locale: "pt-br", path: "/" };
    expect(buildLocaleSwitcherUrl("pt-br", route, "home")).toBe("/");
    expect(buildLocaleSwitcherUrl("en", route, "home")).toBe("/en");
    expect(buildLocaleSwitcher("pt-br", route, "home")).toEqual([
      { code: "pt-br", flag: "🇧🇷", label: "PT", url: "/", active: true },
      { code: "en", flag: "🇺🇸", label: "EN", url: "/en", active: false },
    ]);
  });

  it("keeps the current slug across locales for singular routes", () => {
    const route: ResolvedPublicRoute = {
      kind: "page",
      locale: "pt-br",
      path: "/hello-world",
      slug: "hello-world",
    };
    expect(buildLocaleSwitcherUrl("pt-br", route, "single")).toBe("/hello-world");
    expect(buildLocaleSwitcherUrl("en", route, "single")).toBe("/en/hello-world");
  });

  it("builds post archive URLs", () => {
    const route: ResolvedPublicRoute = {
      kind: "archive",
      locale: "pt-br",
      path: "/posts",
      postType: "post",
      page: 1,
    };
    expect(buildLocaleSwitcherUrl("pt-br", route, "archive", "post")).toBe("/posts");
    expect(buildLocaleSwitcherUrl("en", route, "archive", "post")).toBe("/en/posts");
  });

  it("builds CPT archive URLs", () => {
    const route: ResolvedPublicRoute = {
      kind: "archive",
      locale: "en",
      path: "/en/eventos",
      postType: "eventos",
      page: 1,
    };
    expect(buildLocaleSwitcherUrl("pt-br", route, "archive", "eventos")).toBe("/eventos");
    expect(buildLocaleSwitcherUrl("en", route, "archive", "eventos")).toBe("/en/eventos");
  });

  it("falls back to locale home for 404 without slug", () => {
    const route: ResolvedPublicRoute = { kind: "404", locale: "en", path: "/en" };
    expect(buildLocaleSwitcherUrl("pt-br", route, "404")).toBe("/");
    expect(buildLocaleSwitcherUrl("en", route, "404")).toBe("/en");
  });

  it("preserves slug path for 404 with slug", () => {
    const route: ResolvedPublicRoute = {
      kind: "404",
      locale: "pt-br",
      path: "/missing",
      slug: "missing",
    };
    expect(buildLocaleSwitcherUrl("en", route, "404")).toBe("/en/missing");
  });

  it("builds taxonomy archive URLs", () => {
    const route: ResolvedPublicRoute = {
      kind: "taxonomy",
      locale: "pt-br",
      path: "/category/visum",
      page: 1,
      taxonomyBase: "category",
      taxonomyType: "category",
      taxonomySlug: "visum",
    };
    expect(buildLocaleSwitcherUrl("pt-br", route, "taxonomy")).toBe("/category/visum");
    expect(buildLocaleSwitcherUrl("en", route, "taxonomy")).toBe("/en/category/visum");
  });
});
