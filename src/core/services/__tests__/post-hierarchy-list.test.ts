import { describe, expect, it } from "vitest";
import {
  flattenPostHierarchy,
  formatPostDepthPrefix,
  type PostHierarchyRow,
} from "../post-hierarchy-list.ts";

function row(
  id: number,
  title: string,
  parent_id: number | null,
  created_at: number,
  updated_at?: number,
): PostHierarchyRow {
  return {
    id,
    title,
    parent_id,
    created_at,
    updated_at: updated_at ?? created_at,
  };
}

describe("formatPostDepthPrefix", () => {
  it("returns title without prefix at depth 0", () => {
    expect(formatPostDepthPrefix(0, "Home")).toBe("Home");
  });

  it("prefixes children with dashes by depth", () => {
    expect(formatPostDepthPrefix(1, "About")).toBe("- About");
    expect(formatPostDepthPrefix(2, "Team")).toBe("-- Team");
  });
});

describe("flattenPostHierarchy", () => {
  it("orders top-level parents by recency and groups children after each parent", () => {
    const rows = [
      row(2, "Page B", null, 100),
      row(3, "Page A", null, 300),
      row(4, "Child", 3, 200),
      row(5, "Grandchild", 4, 150),
    ];

    const flat = flattenPostHierarchy(rows);

    expect(flat.map((item) => item.displayTitle)).toEqual([
      "Page A",
      "- Child",
      "-- Grandchild",
      "Page B",
    ]);
  });

  it("treats orphan posts as top-level fallback", () => {
    const rows = [
      row(2, "Root", null, 200),
      row(3, "Orphan", 999, 300),
      row(4, "Orphan child", 3, 100),
    ];

    const flat = flattenPostHierarchy(rows);

    expect(flat.map((item) => item.displayTitle)).toEqual([
      "Orphan",
      "- Orphan child",
      "Root",
    ]);
  });
});
