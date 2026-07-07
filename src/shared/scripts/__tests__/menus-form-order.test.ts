import { describe, expect, it } from "vitest";
import {
  childrenOfFrom,
  normalizeSiblingOrders,
  reorderChildrenIn,
  reorderRootsIn,
  rootItemsFrom,
} from "../menus-form-order.ts";
import type { MenuItemClientRow } from "../menu-item-types.ts";

function row(
  partial: Partial<MenuItemClientRow> & Pick<MenuItemClientRow, "clientId" | "label">,
): MenuItemClientRow {
  return {
    slug: partial.slug ?? partial.label.toLowerCase(),
    order: partial.order ?? 1,
    link_type: partial.link_type ?? "custom",
    ...partial,
  };
}

describe("menus-form sibling order helpers", () => {
  it("normalizes global legacy orders into per-sibling scopes", () => {
    const items = normalizeSiblingOrders([
      row({ clientId: "a", label: "A", order: 1 }),
      row({ clientId: "b", label: "B", order: 2 }),
      row({ clientId: "c", label: "C", order: 3, parentClientId: "b" }),
      row({ clientId: "d", label: "D", order: 4, parentClientId: "b" }),
    ]);

    expect(rootItemsFrom(items).map((item) => [item.clientId, item.order])).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(
      childrenOfFrom(items, "b").map((item) => [item.clientId, item.order]),
    ).toEqual([
      ["c", 1],
      ["d", 2],
    ]);
  });

  it("reorders roots without touching child orders", () => {
    const items = [
      row({ clientId: "a", label: "A", order: 1 }),
      row({ clientId: "b", label: "B", order: 2 }),
      row({ clientId: "c", label: "C", order: 1, parentClientId: "b" }),
    ];

    const reordered = reorderRootsIn(items, ["b", "a"]);
    expect(rootItemsFrom(reordered).map((item) => item.clientId)).toEqual(["b", "a"]);
    expect(childrenOfFrom(reordered, "b")[0]?.order).toBe(1);
  });

  it("reorders children within a parent and updates parent references", () => {
    const items = [
      row({ clientId: "a", label: "A", order: 1, id: 10 }),
      row({ clientId: "b", label: "B", order: 2, id: 20 }),
      row({ clientId: "c", label: "C", order: 1, parentClientId: "a" }),
      row({ clientId: "d", label: "D", order: 2, parentClientId: "a" }),
    ];

    const moved = reorderChildrenIn(items, "b", ["d", "c"]);
    const children = childrenOfFrom(moved, "b");

    expect(children.map((item) => item.clientId)).toEqual(["d", "c"]);
    expect(children.every((item) => item.parentClientId === "b")).toBe(true);
    expect(children.every((item) => item.parentMenuItemId === 20)).toBe(true);
    expect(children.map((item) => item.order)).toEqual([1, 2]);
  });
});
