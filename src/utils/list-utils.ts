import type { DataListColumn } from "../admin/components/DataList.astro";

export const DEFAULT_EXCLUDED_FILTER_COLUMNS = ["id"];

export interface ListFilterField {
  key: string;
  label: string;
  value?: string;
  placeholder?: string;
  /** Nome do parâmetro na query string (default: filter_{key}). */
  paramName?: string;
}

/** Extrai filtros de coluna a partir de params/query (`filter_<col>=valor`). */
export function filterFromParams(params: Record<string, string>): Record<string, string> {
  const filter: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("filter_") && value.trim()) {
      filter[key.slice("filter_".length)] = value.trim();
    }
  }
  return filter;
}

/** Extrai filtros de coluna a partir da query string (`filter_<col>=valor`). */
export function parseFilterParams(
  searchParams: URLSearchParams,
  prefix = "filter_",
): Record<string, string> {
  const filter: Record<string, string> = {};
  for (const [key, value] of searchParams) {
    if (key.startsWith(prefix) && value.trim()) {
      filter[key.slice(prefix.length)] = value.trim();
    }
  }
  return filter;
}

/** Converte snake_case / campos relacionados em label legível. */
export function formatColumnLabel(col: string): string {
  let label = col;
  if (col.includes("_")) {
    const parts = col.split("_");
    if (parts.length > 1) {
      const possibleTable = parts[0];
      const colName = parts.slice(1).join("_");
      label = `${colName} (${possibleTable})`;
    }
  }
  return label.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

/** Monta campos de filtro a partir das colunas visíveis da lista. */
export function buildFilterFieldsFromColumns(
  columns: Pick<DataListColumn, "key" | "label">[],
  filterValues: Record<string, string>,
  options: {
    excludeKeys?: string[];
    placeholder?: string;
  } = {},
): ListFilterField[] {
  const exclude = new Set(options.excludeKeys ?? DEFAULT_EXCLUDED_FILTER_COLUMNS);
  return columns
    .filter((col) => !exclude.has(col.key))
    .map((col) => ({
      key: col.key,
      label: col.label,
      value: filterValues[col.key] ?? "",
      placeholder: options.placeholder,
    }));
}

/** Filtra itens em memória (listas sem paginação server-side). */
export function filterItemsClientSide(
  items: Record<string, unknown>[],
  filter: Record<string, string>,
  columnKeys: string[],
): Record<string, unknown>[] {
  const active = Object.entries(filter).filter(
    ([key, value]) => value.trim() && columnKeys.includes(key),
  );
  if (active.length === 0) return items;

  return items.filter((item) =>
    active.every(([key, value]) =>
      String(item[key] ?? "")
        .toLowerCase()
        .includes(value.trim().toLowerCase()),
    ),
  );
}

export function hasActiveFilters(filter: Record<string, string>): boolean {
  return Object.values(filter).some((value) => value.trim().length > 0);
}

/** Preserva query params atuais ao montar URLs de filtro/paginação. */
export function buildUrlWithParams(
  pathname: string,
  currentParams: URLSearchParams,
  overrides: Record<string, string | null | undefined>,
): string {
  const params = new URLSearchParams(currentParams);
  for (const [key, value] of Object.entries(overrides)) {
    if (value == null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
