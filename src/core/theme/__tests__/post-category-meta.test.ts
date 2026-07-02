import { describe, expect, it } from "vitest";
import { injectCategoryMeta } from "../post-category-meta.ts";

describe("injectCategoryMeta", () => {
  it("injects category_slug and category_name from first category taxonomy", () => {
    const meta: Record<string, string> = {};
    injectCategoryMeta(meta, [
      { type: "tag", slug: "rock", name: "Rock" },
      { type: "category", slug: "progcast", name: "Progcast" },
    ]);
    expect(meta).toEqual({
      category_slug: "progcast",
      category_name: "Progcast",
    });
  });

  it("does not overwrite existing category_slug", () => {
    const meta: Record<string, string> = { category_slug: "custom" };
    injectCategoryMeta(meta, [{ type: "category", slug: "progcast", name: "Progcast" }]);
    expect(meta.category_slug).toBe("custom");
    expect(meta.category_name).toBeUndefined();
  });

  it("does not overwrite existing category_name when category_slug is preset", () => {
    const meta: Record<string, string> = {
      category_slug: "custom",
      category_name: "Custom Name",
    };
    injectCategoryMeta(meta, [{ type: "category", slug: "progcast", name: "Progcast" }]);
    expect(meta.category_name).toBe("Custom Name");
  });

  it("sets category_name only when missing and category_slug was injected", () => {
    const meta: Record<string, string> = { category_name: "Existing" };
    injectCategoryMeta(meta, [{ type: "category", slug: "progcast", name: "Progcast" }]);
    expect(meta).toEqual({
      category_name: "Existing",
      category_slug: "progcast",
    });
  });

  it("no-ops when there is no category taxonomy", () => {
    const meta: Record<string, string> = {};
    injectCategoryMeta(meta, [{ type: "tag", slug: "news", name: "News" }]);
    expect(meta).toEqual({});
  });
});
