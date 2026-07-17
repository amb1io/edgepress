export type TaxonomyHierarchyRow = {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  created_at: number | null;
  updated_at: number | null;
  language?: string | null;
};

export type FlatTaxonomyListItem = TaxonomyHierarchyRow & {
  depth: number;
  displayName: string;
};

function recencyKey(row: TaxonomyHierarchyRow): number {
  return row.updated_at ?? row.created_at ?? row.id;
}

function sortByRecencyDesc(rows: TaxonomyHierarchyRow[]): TaxonomyHierarchyRow[] {
  return [...rows].sort((a, b) => recencyKey(b) - recencyKey(a));
}

export function formatTaxonomyDepthPrefix(depth: number, name: string): string {
  if (depth <= 0) return name;
  return `${"-".repeat(depth)} ${name}`;
}

export function flattenTaxonomyHierarchy(
  rows: TaxonomyHierarchyRow[],
  rootId: number,
): FlatTaxonomyListItem[] {
  const terms = rows.filter((row) => row.parent_id != null);
  if (terms.length === 0) return [];

  const childrenByParent = new Map<number, TaxonomyHierarchyRow[]>();
  for (const row of terms) {
    const parentId = row.parent_id;
    if (parentId == null) continue;
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(row);
    childrenByParent.set(parentId, siblings);
  }

  const knownIds = new Set(terms.map((row) => row.id));
  const topLevel = sortByRecencyDesc(
    terms.filter(
      (row) =>
        row.parent_id === rootId ||
        (row.parent_id != null && !knownIds.has(row.parent_id)),
    ),
  );

  const result: FlatTaxonomyListItem[] = [];

  function appendSubtree(row: TaxonomyHierarchyRow, depth: number): void {
    result.push({
      ...row,
      depth,
      displayName: formatTaxonomyDepthPrefix(depth, row.name),
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
