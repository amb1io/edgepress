import { describe, it, expect } from "vitest";
import {
  TAXONOMY_URL_BASES,
  buildTaxonomyPublicPath,
  resolveTaxonomyFromSegments,
  resolveTaxonomyUrlBase,
} from "../taxonomy-routes.ts";

describe("taxonomy-routes", () => {
  it("maps WordPress URL bases to DB types", () => {
    expect(TAXONOMY_URL_BASES).toEqual({ category: "category", tag: "tag" });
    expect(resolveTaxonomyUrlBase("category")).toBe("category");
    expect(resolveTaxonomyUrlBase("tag")).toBe("tag");
    expect(resolveTaxonomyUrlBase("posts")).toBeNull();
  });

  it("resolves two-segment taxonomy paths", () => {
    expect(resolveTaxonomyFromSegments(["category", "visum"])).toEqual({
      taxonomyBase: "category",
      taxonomyType: "category",
      termSlug: "visum",
    });
    expect(resolveTaxonomyFromSegments(["tag", "rock"])).toEqual({
      taxonomyBase: "tag",
      taxonomyType: "tag",
      termSlug: "rock",
    });
    expect(resolveTaxonomyFromSegments(["category"])).toBeNull();
    expect(resolveTaxonomyFromSegments(["category", "visum", "extra"])).toBeNull();
  });

  it("builds public taxonomy paths with locale prefix", () => {
    expect(buildTaxonomyPublicPath("category", "visum", "")).toBe("/category/visum");
    expect(buildTaxonomyPublicPath("tag", "foo", "/en")).toBe("/en/tag/foo");
  });
});
