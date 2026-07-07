import { describe, it, expect } from "vitest";
import { buildTaxonomyPublicPath } from "../taxonomy-routes.ts";

describe("taxonomy-routes", () => {
  it("builds public taxonomy paths with locale prefix", () => {
    expect(buildTaxonomyPublicPath("category", "visum", "")).toBe("/category/visum");
    expect(buildTaxonomyPublicPath("categorias", "foo", "/en")).toBe("/en/categorias/foo");
  });
});
