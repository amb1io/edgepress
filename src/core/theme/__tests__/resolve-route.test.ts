import { describe, it, expect } from "vitest";
import { resolvePublicRoute } from "../resolve-route.ts";

describe("resolvePublicRoute", () => {
  it("resolves home", () => {
    expect(resolvePublicRoute("/", new URLSearchParams())).toEqual({
      kind: "home",
      locale: "pt-br",
      path: "/",
    });
  });

  it("resolves post archive alias at /posts", () => {
    expect(resolvePublicRoute("/posts", new URLSearchParams())).toEqual({
      kind: "archive",
      locale: "pt-br",
      path: "/posts",
      postType: "post",
      page: 1,
    });
    expect(resolvePublicRoute("/posts", new URLSearchParams("page=3"))).toEqual({
      kind: "archive",
      locale: "pt-br",
      path: "/posts",
      postType: "post",
      page: 3,
    });
  });

  it("resolves /blog as CPT slug route, not post archive alias", () => {
    expect(resolvePublicRoute("/blog", new URLSearchParams("page=3"))).toEqual({
      kind: "page",
      locale: "pt-br",
      path: "/blog",
      slug: "blog",
      page: 3,
    });
  });

  it("resolves localized archive routes", () => {
    expect(resolvePublicRoute("/en/posts", new URLSearchParams())).toEqual({
      kind: "archive",
      locale: "en",
      path: "/en/posts",
      postType: "post",
      page: 1,
    });
  });

  it("resolves slug routes with page query param", () => {
    expect(resolvePublicRoute("/produtos", new URLSearchParams("page=2"))).toEqual({
      kind: "page",
      locale: "pt-br",
      path: "/produtos",
      slug: "produtos",
      page: 2,
    });
  });

  it("returns 404 for invalid slugs", () => {
    expect(resolvePublicRoute("/bad slug", new URLSearchParams())).toEqual({
      kind: "404",
      locale: "pt-br",
      path: "/bad slug",
    });
  });
});
