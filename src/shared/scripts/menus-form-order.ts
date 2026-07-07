import type { MenuItemClientRow } from "./menu-item-types.ts";

function isRootItem(item: MenuItemClientRow): boolean {
  return !item.parentClientId;
}

/** Reassign order 1..N within each sibling group (roots and per-parent children). */
export function normalizeSiblingOrders(
  items: MenuItemClientRow[],
): MenuItemClientRow[] {
  const byId = new Map(items.map((item) => [item.clientId, { ...item }]));
  const roots = [...byId.values()]
    .filter(isRootItem)
    .sort((a, b) => a.order - b.order || a.clientId.localeCompare(b.clientId));

  let rootOrder = 1;
  for (const root of roots) {
    const updated = byId.get(root.clientId);
    if (!updated) continue;
    updated.order = rootOrder++;
    updated.parentClientId = null;
    updated.parentMenuItemId = null;

    const children = [...byId.values()]
      .filter((item) => item.parentClientId === root.clientId)
      .sort((a, b) => a.order - b.order || a.clientId.localeCompare(b.clientId));

    let childOrder = 1;
    for (const child of children) {
      const updatedChild = byId.get(child.clientId);
      if (!updatedChild) continue;
      updatedChild.order = childOrder++;
      updatedChild.parentClientId = root.clientId;
      updatedChild.parentMenuItemId = root.id ?? null;
    }
  }

  const validRootIds = new Set(roots.map((r) => r.clientId));
  for (const item of byId.values()) {
    if (item.parentClientId && !validRootIds.has(item.parentClientId)) {
      item.parentClientId = null;
      item.parentMenuItemId = null;
      item.order = rootOrder++;
    }
  }

  return [...byId.values()];
}

export function rootItemsFrom(
  items: MenuItemClientRow[],
): MenuItemClientRow[] {
  return items
    .filter(isRootItem)
    .sort((a, b) => a.order - b.order || a.clientId.localeCompare(b.clientId));
}

export function childrenOfFrom(
  items: MenuItemClientRow[],
  parentClientId: string,
): MenuItemClientRow[] {
  return items
    .filter((item) => item.parentClientId === parentClientId)
    .sort((a, b) => a.order - b.order || a.clientId.localeCompare(b.clientId));
}

export function reorderRootsIn(
  items: MenuItemClientRow[],
  orderedClientIds: string[],
): MenuItemClientRow[] {
  const orderMap = new Map(
    orderedClientIds.map((clientId, index) => [clientId, index + 1]),
  );
  return items.map((item) => {
    if (!isRootItem(item) || !orderMap.has(item.clientId)) return item;
    return { ...item, order: orderMap.get(item.clientId)! };
  });
}

export function reorderChildrenIn(
  items: MenuItemClientRow[],
  parentClientId: string,
  orderedClientIds: string[],
): MenuItemClientRow[] {
  const parent = items.find((item) => item.clientId === parentClientId);
  const parentMenuItemId = parent?.id ?? null;
  const orderMap = new Map(
    orderedClientIds.map((clientId, index) => [clientId, index + 1]),
  );

  return items.map((item) => {
    if (!orderMap.has(item.clientId)) return item;
    return {
      ...item,
      parentClientId,
      parentMenuItemId,
      order: orderMap.get(item.clientId)!,
    };
  });
}

export function nextRootOrder(items: MenuItemClientRow[]): number {
  const roots = rootItemsFrom(items);
  if (roots.length === 0) return 1;
  return Math.max(...roots.map((item) => item.order)) + 1;
}

export function nextChildOrder(
  items: MenuItemClientRow[],
  parentClientId: string,
): number {
  const children = childrenOfFrom(items, parentClientId);
  if (children.length === 0) return 1;
  return Math.max(...children.map((item) => item.order)) + 1;
}
