import { describe, expect, it } from "vitest";
import {
  flattenTaxonomyHierarchy,
  formatTaxonomyDepthPrefix,
  type TaxonomyHierarchyRow,
} from "../taxonomy-hierarchy-list.ts";

function row(
  id: number,
  name: string,
  parent_id: number | null,
  created_at: number,
  updated_at?: number,
): TaxonomyHierarchyRow {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    parent_id,
    created_at,
    updated_at: updated_at ?? created_at,
  };
}

describe("formatTaxonomyDepthPrefix", () => {
  it("returns name without prefix at depth 0", () => {
    expect(formatTaxonomyDepthPrefix(0, "Ação")).toBe("Ação");
  });

  it("prefixes children with dashes by depth", () => {
    expect(formatTaxonomyDepthPrefix(1, "Drama")).toBe("- Drama");
    expect(formatTaxonomyDepthPrefix(2, "Suspense")).toBe("-- Suspense");
    expect(formatTaxonomyDepthPrefix(3, "Sub")).toBe("--- Sub");
  });
});

describe("flattenTaxonomyHierarchy", () => {
  const rootId = 1;

  it("orders top-level parents by recency and groups children after each parent", () => {
    const rows = [
      row(2, "Comédia", rootId, 100),
      row(3, "Ação", rootId, 300),
      row(4, "Drama", 3, 200),
      row(5, "Suspense", 4, 150),
    ];

    const flat = flattenTaxonomyHierarchy(rows, rootId);

    expect(flat.map((item) => item.displayName)).toEqual([
      "Ação",
      "- Drama",
      "-- Suspense",
      "Comédia",
    ]);
  });

  it("sorts siblings by recency within the same parent", () => {
    const rows = [
      row(2, "Pai", rootId, 500),
      row(3, "Filho antigo", 2, 100),
      row(4, "Filho recente", 2, 400),
    ];

    const flat = flattenTaxonomyHierarchy(rows, rootId);

    expect(flat.map((item) => item.name)).toEqual([
      "Pai",
      "Filho recente",
      "Filho antigo",
    ]);
  });

  it("treats orphan terms as top-level fallback", () => {
    const rows = [
      row(2, "Raiz A", rootId, 200),
      row(3, "Órfão", 999, 300),
      row(4, "Filho órfão", 3, 100),
    ];

    const flat = flattenTaxonomyHierarchy(rows, rootId);

    expect(flat.map((item) => item.displayName)).toEqual([
      "Órfão",
      "- Filho órfão",
      "Raiz A",
    ]);
  });

  it("returns empty list when there are no terms", () => {
    expect(flattenTaxonomyHierarchy([], rootId)).toEqual([]);
  });
});
