import type { DataListTableConfig } from "./data-list-page-length.ts";
import {
  buildDataListActionsHtml,
  type DataListActionTemplates,
} from "./data-list-client.ts";
import type { DataListOrderEntry } from "./data-list-order.ts";

type PaginatedListResponse = {
  success: boolean;
  data: Record<string, unknown>[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type DataListActionTemplates = {
  editLinkTemplate: string;
  deletePathTemplate?: string;
  deleteConfirm: string;
  duplicatePathTemplate?: string;
  addTranslationPathTemplate?: string;
  editLabel?: string;
  deleteLabel?: string;
  duplicateLabel?: string;
  addTranslationLabel?: string;
  actionsLabel?: string;
};

export type ServerFetchAjaxOptions = {
  displayColumnKeys: string[];
  sortableColumnKeys: string[];
  columnIndexOffset: number;
  linkColumnKey: string;
  actionTemplates: DataListActionTemplates | null;
  hasActions: boolean;
};

function expandTemplate(template: string, item: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(item[key] ?? ""));
}

function escapeCell(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCellHtml(
  key: string,
  item: Record<string, unknown>,
  linkColumnKey: string,
  actionTemplates: DataListActionTemplates | null,
): string {
  const raw = String(item[key] ?? "—");
  const escaped = escapeCell(raw);
  if (key === linkColumnKey && actionTemplates) {
    const href = expandTemplate(actionTemplates.editLinkTemplate, item);
    return `<a href="${href}" class="link link-hover text-blue-600">${escaped}</a>`;
  }
  return escaped;
}

function mapDataTablesOrder(
  order: Array<{ column: number; dir: string }>,
  displayColumnKeys: string[],
  sortableColumnKeys: string[],
  columnIndexOffset: number,
): DataListOrderEntry[] {
  const entries: DataListOrderEntry[] = [];
  for (const o of order) {
    const displayIndex = o.column - columnIndexOffset;
    const column = displayColumnKeys[displayIndex];
    if (!column || !sortableColumnKeys.includes(column)) continue;
    entries.push({ column, dir: o.dir === "asc" ? "asc" : "desc" });
  }
  return entries;
}

function syncListUrl(page: number, limit: number): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  window.history.replaceState(null, "", url.toString());
}

function processHtmx(node: HTMLElement): void {
  const htmxLib =
    typeof globalThis !== "undefined" &&
    (globalThis as { htmx?: { process?: (el: Element) => void } }).htmx;
  htmxLib?.process?.(node);
}

/**
 * Ajax POST para DataTables `serverSide: true` (paginação, busca e ordenação no servidor).
 */
export function createServerFetchAjax(
  config: DataListTableConfig,
  options: ServerFetchAjaxOptions,
): (
  data: {
    draw: number;
    start: number;
    length: number;
    search: { value: string };
    order: Array<{ column: number; dir: string }>;
  },
  callback: (result: {
    draw: number;
    recordsTotal: number;
    recordsFiltered: number;
    data: string[][];
  }) => void,
) => void {
  const fetchConfig = config.serverFetch;
  if (!fetchConfig) {
    return (_data, callback) => {
      callback({ draw: 0, recordsTotal: 0, recordsFiltered: 0, data: [] });
    };
  }

  return (data, callback) => {
    const limit = Math.max(1, data.length);
    const page = Math.floor(data.start / limit) + 1;
    const search = data.search?.value?.trim() ?? "";
    const orders = mapDataTablesOrder(
      data.order ?? [],
      options.displayColumnKeys,
      options.sortableColumnKeys,
      options.columnIndexOffset,
    );

    const effectiveOrders =
      orders.length > 0
        ? orders
        : [{ column: "created_at", dir: "desc" as const }];
    const serialized = {
      order: effectiveOrders.map((o) => o.column).join(","),
      orderDir: effectiveOrders.map((o) => o.dir).join(","),
    };

    void fetch(fetchConfig.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        ...fetchConfig.context,
        page,
        limit,
        search,
        ...serialized,
        ...(effectiveOrders.length > 1 ? { orders: effectiveOrders } : {}),
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: PaginatedListResponse | null) => {
        if (!json?.success || !Array.isArray(json.data)) {
          callback({
            draw: data.draw,
            recordsTotal: 0,
            recordsFiltered: 0,
            data: [],
          });
          return;
        }

        fetchConfig.total = json.pagination.total;
        fetchConfig.page = json.pagination.page;

        syncListUrl(json.pagination.page, json.pagination.limit);

        const rows: string[][] = json.data.map((item) => {
          const cells = options.displayColumnKeys.map((key) =>
            formatCellHtml(key, item, options.linkColumnKey, options.actionTemplates),
          );
          if (options.hasActions && options.actionTemplates) {
            cells.push(
              buildDataListActionsHtml({
                editLink: expandTemplate(options.actionTemplates.editLinkTemplate, item),
                deletePath: options.actionTemplates.deletePathTemplate
                  ? expandTemplate(options.actionTemplates.deletePathTemplate, item)
                  : undefined,
                deleteConfirm: options.actionTemplates.deleteConfirm,
                duplicatePath: options.actionTemplates.duplicatePathTemplate
                  ? expandTemplate(options.actionTemplates.duplicatePathTemplate, item)
                  : undefined,
                addTranslationPath: options.actionTemplates.addTranslationPathTemplate
                  ? expandTemplate(
                      options.actionTemplates.addTranslationPathTemplate,
                      item,
                    )
                  : undefined,
                editLabel: options.actionTemplates.editLabel,
                deleteLabel: options.actionTemplates.deleteLabel,
                duplicateLabel: options.actionTemplates.duplicateLabel,
                addTranslationLabel: options.actionTemplates.addTranslationLabel,
                actionsLabel: options.actionTemplates.actionsLabel,
              }),
            );
          }
          return cells;
        });

        callback({
          draw: data.draw,
          recordsTotal: json.pagination.total,
          recordsFiltered: json.pagination.total,
          data: rows,
        });
      })
      .catch(() => {
        callback({
          draw: data.draw,
          recordsTotal: 0,
          recordsFiltered: 0,
          data: [],
        });
      });
  };
}

/** Reprocessa HTMX nos botões de ação após cada draw do DataTables. */
export function bindServerFetchHtmx(table: HTMLTableElement): void {
  const jQuery = (window as Window & { $?: (sel: string) => { DataTable?: () => DataTables.Api } }).$;
  if (!jQuery) return;

  jQuery(table).on("draw.dt", () => {
    const tbody = table.querySelector("tbody");
    if (tbody) processHtmx(tbody);
  });
}

