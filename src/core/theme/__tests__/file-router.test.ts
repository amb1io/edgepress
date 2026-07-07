import { describe, it, expect } from "vitest";
import {
  buildRouteTable,
  isRoutableTemplateKey,
  matchRoute,
  parseTemplateKeyToRoute,
} from "../file-router.ts";

describe("file-router", () => {
  it("skips non-routable template keys", () => {
    expect(isRoutableTemplateKey("layouts/base")).toBe(false);
    expect(isRoutableTemplateKey("parts/header")).toBe(false);
    expect(isRoutableTemplateKey("404")).toBe(false);
    expect(isRoutableTemplateKey("archive")).toBe(false);
    expect(isRoutableTemplateKey("trabalhos/index")).toBe(true);
  });

  it("parses index and dynamic routes", () => {
    expect(parseTemplateKeyToRoute("index")).toEqual({
      templateKey: "index",
      segments: [],
      priority: 1,
    });
    expect(parseTemplateKeyToRoute("trabalhos/[categorias]")).toMatchObject({
      templateKey: "trabalhos/[categorias]",
      segments: [
        { type: "static", value: "trabalhos" },
        { type: "dynamic", param: "categorias" },
      ],
    });
    expect(parseTemplateKeyToRoute("[slug]")).toMatchObject({
      templateKey: "[slug]",
      segments: [{ type: "dynamic", param: "slug" }],
    });
  });

  it("matches home index", () => {
    const table = buildRouteTable(["index", "[slug]"]);
    expect(matchRoute(table, [])).toEqual({
      templateKey: "index",
      params: {},
      staticSegments: [],
    });
  });

  it("matches nested index and dynamic child", () => {
    const table = buildRouteTable([
      "trabalhos/index",
      "trabalhos/[categorias]",
      "[slug]",
    ]);
    expect(matchRoute(table, ["trabalhos"])).toEqual({
      templateKey: "trabalhos/index",
      params: {},
      staticSegments: ["trabalhos"],
    });
    expect(matchRoute(table, ["trabalhos", "publicidade"])).toEqual({
      templateKey: "trabalhos/[categorias]",
      params: { categorias: "publicidade" },
      staticSegments: ["trabalhos"],
    });
  });

  it("prefers static segment over root dynamic slug", () => {
    const table = buildRouteTable(["trabalhos/index", "[slug]"]);
    expect(matchRoute(table, ["trabalhos"])?.templateKey).toBe("trabalhos/index");
    expect(matchRoute(table, ["about"])?.templateKey).toBe("[slug]");
  });

  it("matches search and posts archive templates", () => {
    const table = buildRouteTable(["search", "posts/index", "category/[slug]"]);
    expect(matchRoute(table, ["search"])?.templateKey).toBe("search");
    expect(matchRoute(table, ["posts"])?.templateKey).toBe("posts/index");
    expect(matchRoute(table, ["category", "visum"])).toEqual({
      templateKey: "category/[slug]",
      params: { slug: "visum" },
      staticSegments: ["category"],
    });
  });

  it("returns null when no route matches", () => {
    const table = buildRouteTable(["index", "trabalhos/index"]);
    expect(matchRoute(table, ["missing", "path"])).toBeNull();
  });

  it("supports catch-all segments", () => {
    const table = buildRouteTable(["docs/[...path]"]);
    expect(matchRoute(table, ["docs", "a", "b"])).toEqual({
      templateKey: "docs/[...path]",
      params: { path: "a/b" },
      staticSegments: ["docs"],
    });
  });
});
