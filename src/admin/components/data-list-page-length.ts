export const DATA_LIST_PAGE_LENGTH_OPTIONS = [10, 20, 50, 100] as const;

/** Limite ao carregar listas inteiras para DataTables no cliente (como post_types). */
export const DATA_LIST_CLIENT_FETCH_LIMIT = 5000;

/** Aceita opções padrão (10/20/50/100) ou valor customizado das settings (ex.: datalist_pagination). */
export function normalizeDataListPageLength(value: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 10;
  if (n > 5000) return 5000;
  if ((DATA_LIST_PAGE_LENGTH_OPTIONS as readonly number[]).includes(n)) return n;
  return n;
}

const LIMIT_URL_SENTINEL = 9_999_999;

export function toLimitUrlTemplate(buildLimitUrl: (limit: number) => string): string {
  return buildLimitUrl(LIMIT_URL_SENTINEL).replace(String(LIMIT_URL_SENTINEL), "__LIMIT__");
}

export interface DataListServerFetchConfig {
  url: string;
  context: Record<string, unknown>;
  total: number;
  page: number;
}

export interface DataListTableConfig {
  emptyMessage: string;
  serverPagination: boolean;
  /** Busca páginas via POST sem recarregar a página inteira. */
  serverFetch?: DataListServerFetchConfig;
  /** Ordenação feita no servidor (DataTables sincroniza via URL). */
  serverBackedOrder: boolean;
  /** Habilita ordenação por coluna no DataTables (default true). */
  ordering?: boolean;
  /** Coluna → campo do item com URL para renderizar link na célula. */
  columnLinkKeys?: Record<string, string>;
  selectable: boolean;
  hasActions: boolean;
  dataColumnCount: number;
  pageLength: number;
  language?: {
    emptyTable?: string;
    info?: string;
    infoEmpty?: string;
    infoFiltered?: string;
    lengthMenu?: string;
    search?: string;
    zeroRecords?: string;
    paginate?: {
      previous?: string;
      next?: string;
    };
  };
  /** Chaves de todas as colunas de dados exibidas, em ordem. */
  displayColumnKeys?: string[];
  /** Subconjunto de `displayColumnKeys` que aceita ordenação. */
  sortableColumnKeys?: string[];
  /** Ordem inicial [[índice DT, direção], ...]. */
  initialOrder?: Array<[number, "asc" | "desc"]>;
  /** URL com `__ORDER__` e `__ORDER_DIR__` (valores separados por vírgula). */
  orderUrlTemplate?: string;
  /** URL com placeholder `__LIMIT__` para troca de itens por página no servidor. */
  limitUrlTemplate?: string;
  selectAllId?: string;
}
