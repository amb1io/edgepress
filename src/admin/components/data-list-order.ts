export type DataListOrderEntry = { column: string; dir: "asc" | "desc" };

export function parseDataListOrderParams(
  order: string | null | undefined,
  orderDir: string | null | undefined,
  fallback: DataListOrderEntry = { column: "created_at", dir: "desc" },
): DataListOrderEntry[] {
  const rawOrder = order?.trim();
  if (!rawOrder) return [fallback];

  const columns = rawOrder.split(",").map((part) => part.trim()).filter(Boolean);
  if (columns.length === 0) return [fallback];

  const dirs = (orderDir ?? "").split(",").map((part) => part.trim());
  return columns.map((column, index) => ({
    column,
    dir: dirs[index] === "asc" ? "asc" : "desc",
  }));
}

export function serializeDataListOrder(entries: DataListOrderEntry[]): {
  order: string;
  orderDir: string;
} {
  if (entries.length === 0) {
    return { order: "created_at", orderDir: "desc" };
  }
  return {
    order: entries.map((entry) => entry.column).join(","),
    orderDir: entries.map((entry) => entry.dir).join(","),
  };
}

const ORDER_URL_SENTINEL = 9_999_998;
const ORDER_DIR_URL_SENTINEL = 9_999_997;

export function toOrderUrlTemplate(
  buildOrderUrl: (order: string, orderDir: string) => string,
): string {
  return buildOrderUrl(String(ORDER_URL_SENTINEL), String(ORDER_DIR_URL_SENTINEL))
    .replace(String(ORDER_URL_SENTINEL), "__ORDER__")
    .replace(String(ORDER_DIR_URL_SENTINEL), "__ORDER_DIR__");
}

/** Índices DataTables (inclui offset de checkbox) para `order` inicial. */
export function buildDataTableInitialOrder(
  entries: DataListOrderEntry[],
  displayColumnKeys: string[],
  sortableColumnKeys: string[],
  columnIndexOffset: number,
): Array<[number, "asc" | "desc"]> {
  const order: Array<[number, "asc" | "desc"]> = [];

  for (const entry of entries) {
    const sortableIdx = sortableColumnKeys.indexOf(entry.column);
    if (sortableIdx < 0) continue;
    const displayIdx = displayColumnKeys.indexOf(entry.column);
    if (displayIdx < 0) continue;
    order.push([columnIndexOffset + displayIdx, entry.dir]);
  }

  return order;
}
