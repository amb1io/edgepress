import { describe, it, expect, vi } from "vitest";
import {
  filterLeafTaxonomyItems,
  getAllowedTaxonomyTypesFromMetaSchema,
  isTaxonomyAllowedForPostType,
  mapTaxonomyItems,
  parseGetRelatedPostsArgs,
  parseGetAuthorArgs,
  parseGetTaxonomiesArgs,
  createGetRelatedPostsHandler,
  createGetAuthorHandler,
} from "../theme-functions.ts";

describe("mapTaxonomyItems", () => {
  it("keeps only name and slug", () => {
    expect(
      mapTaxonomyItems([
        { name: "Categoria", slug: "categoria", id: 1, type: "category" } as never,
        { name: null, slug: undefined },
      ]),
    ).toEqual([
      { name: "Categoria", slug: "categoria" },
      { name: "", slug: "" },
    ]);
  });
});

describe("filterLeafTaxonomyItems", () => {
  it("excludes terms that are parents of other terms", () => {
    const items = [
      { id: 1, name: "Root", slug: "root", parent_id: null },
      { id: 2, name: "Child", slug: "child", parent_id: 1 },
    ];
    expect(filterLeafTaxonomyItems(items)).toEqual([{ id: 2, name: "Child", slug: "child", parent_id: 1 }]);
  });
});

describe("getAllowedTaxonomyTypesFromMetaSchema", () => {
  it("reads taxonomy defaults from meta_schema JSON string", () => {
    const schema = JSON.stringify([
      { key: "icon", type: "string" },
      { key: "taxonomy", type: "array", default: ["category", "tag"] },
    ]);
    expect(getAllowedTaxonomyTypesFromMetaSchema(schema)).toEqual(["category", "tag"]);
  });

  it("returns empty array when taxonomy key is missing", () => {
    expect(getAllowedTaxonomyTypesFromMetaSchema([{ key: "icon", type: "string" }])).toEqual([]);
  });
});

describe("isTaxonomyAllowedForPostType", () => {
  it("checks membership in allowed taxonomy types", () => {
    const schema = [{ key: "taxonomy", type: "array", default: ["category", "tag"] }];
    expect(isTaxonomyAllowedForPostType(schema, "category")).toBe(true);
    expect(isTaxonomyAllowedForPostType(schema, "categorias")).toBe(false);
  });
});

describe("parseGetTaxonomiesArgs", () => {
  it("parses valid tag arguments", () => {
    expect(parseGetTaxonomiesArgs("'post', 'category' as categories")).toEqual({
      postType: "post",
      taxonomyType: "category",
      varName: "categories",
    });
    expect(parseGetTaxonomiesArgs('"jobs", "categorias" as job_cats')).toEqual({
      postType: "jobs",
      taxonomyType: "categorias",
      varName: "job_cats",
    });
  });

  it("returns null for invalid syntax", () => {
    expect(parseGetTaxonomiesArgs("post, category as categories")).toBeNull();
    expect(parseGetTaxonomiesArgs("'post' 'category' as categories")).toBeNull();
    expect(parseGetTaxonomiesArgs("")).toBeNull();
  });
});

describe("parseGetRelatedPostsArgs", () => {
  it("parses id/slug expression with optional limit", () => {
    expect(parseGetRelatedPostsArgs("post.id as related")).toEqual({
      idOrSlugExpr: "post.id",
      varName: "related",
    });
    expect(parseGetRelatedPostsArgs("post.id, 6 as related")).toEqual({
      idOrSlugExpr: "post.id",
      limitExpr: "6",
      varName: "related",
    });
    expect(parseGetRelatedPostsArgs("'hello-world', 4 as items")).toEqual({
      idOrSlugExpr: "'hello-world'",
      limitExpr: "4",
      varName: "items",
    });
  });

  it("returns null for invalid syntax", () => {
    expect(parseGetRelatedPostsArgs("post.id")).toBeNull();
    expect(parseGetRelatedPostsArgs("as related")).toBeNull();
  });
});

describe("parseGetAuthorArgs", () => {
  it("parses id/slug expression", () => {
    expect(parseGetAuthorArgs("post.id as author")).toEqual({
      idOrSlugExpr: "post.id",
      varName: "author",
    });
    expect(parseGetAuthorArgs("'hello-world' as author")).toEqual({
      idOrSlugExpr: "'hello-world'",
      varName: "author",
    });
  });

  it("returns null for invalid syntax", () => {
    expect(parseGetAuthorArgs("post.id")).toBeNull();
    expect(parseGetAuthorArgs("as author")).toBeNull();
  });
});

describe("createGetAuthorHandler", () => {
  it("returns null without fetch when id is empty", async () => {
    const fetcher = vi.fn();
    const handler = createGetAuthorHandler(fetcher);
    expect(await handler("")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("delegates to fetcher", async () => {
    const handler = createGetAuthorHandler(async () => ({
      name: "Rhamses",
      image: "",
      description: "Bio",
    }));
    expect(await handler(1)).toEqual({ name: "Rhamses", image: "", description: "Bio" });
  });
});

describe("createGetRelatedPostsHandler", () => {
  it("normalizes limit and delegates to fetcher", async () => {
    const handler = createGetRelatedPostsHandler(async (_id, limit) => [
      {
        id: 2,
        title: "Related",
        slug: "related",
        excerpt: "",
        body_html: "",
        author_name: "",
        published_at: null,
        post_type_slug: "post",
        meta: {},
      },
    ]);
    const items = await handler(1, 0);
    expect(items).toHaveLength(1);
  });
});
