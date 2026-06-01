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

/** Preserva query params atuais ao montar URLs de paginação/ordenação. */
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
