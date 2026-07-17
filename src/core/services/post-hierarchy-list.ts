export type PostHierarchyRow = {
  id: number;
  title: string;
  parent_id: number | null;
  created_at: number | null;
  updated_at: number | null;
};

export type FlatPostListItem = PostHierarchyRow & {
  depth: number;
  displayTitle: string;
};

function recencyKey(row: PostHierarchyRow): number {
  return row.updated_at ?? row.created_at ?? row.id;
}

function sortByRecencyDesc(rows: PostHierarchyRow[]): PostHierarchyRow[] {
  return [...rows].sort((a, b) => recencyKey(b) - recencyKey(a));
}

export function formatPostDepthPrefix(depth: number, title: string): string {
  if (depth <= 0) return title;
  return `${"-".repeat(depth)} ${title}`;
}

export function flattenPostHierarchy(rows: PostHierarchyRow[]): FlatPostListItem[] {
  if (rows.length === 0) return [];

  const childrenByParent = new Map<number, PostHierarchyRow[]>();
  for (const row of rows) {
    const parentId = row.parent_id;
    if (parentId == null) continue;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(row);
    childrenByParent.set(parentId, siblings);
  }

  const knownIds = new Set(rows.map((row) => row.id));
  const topLevel = sortByRecencyDesc(
    rows.filter(
      (row) =>
        row.parent_id === null ||
        (row.parent_id != null && !knownIds.has(row.parent_id)),
    ),
  );

  const result: FlatPostListItem[] = [];

  function appendSubtree(row: PostHierarchyRow, depth: number): void {
    const title = row.title ?? "";
    result.push({
      ...row,
      depth,
      displayTitle: formatPostDepthPrefix(depth, title),
    });

    const children = sortByRecencyDesc(childrenByParent.get(row.id) ?? []);
    for (const child of children) {
      appendSubtree(child, depth + 1);
    }
  }

  for (const row of topLevel) {
    appendSubtree(row, 0);
  }

  return result;
}
