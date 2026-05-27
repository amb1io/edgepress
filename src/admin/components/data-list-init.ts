import type { DataListTableConfig } from "./data-list-page-length.ts";
import {
  DATA_LIST_PAGE_LENGTH_OPTIONS,
  normalizeDataListPageLength,
} from "./data-list-page-length.ts";
import { serializeDataListOrder } from "./data-list-order.ts";
import { registerDataListTableApi, tableApis } from "./data-list-client.ts";

const lengthMenu = [
  [...DATA_LIST_PAGE_LENGTH_OPTIONS],
  [...DATA_LIST_PAGE_LENGTH_OPTIONS],
] as [number[], number[]];

function buildColumnDefs(config: DataListTableConfig): DataTables.ColumnDefsSettings[] {
  const defs: DataTables.ColumnDefsSettings[] = [];
  let idx = 0;

  if (config.selectable) {
    defs.push({ targets: idx++, orderable: false, searchable: false });
  }

  const displayKeys = config.displayColumnKeys ?? [];
  const sortableSet = new Set(config.sortableColumnKeys ?? []);

  if (sortableSet.size > 0) {
    for (let i = 0; i < displayKeys.length; i++) {
      if (!sortableSet.has(displayKeys[i])) {
        defs.push({ targets: idx + i, orderable: false });
      }
    }
  }
  idx += config.dataColumnCount;

  if (config.hasActions) {
    defs.push({ targets: idx, orderable: false, searchable: false });
  }

  return defs;
}

function bindSelectAll(table: HTMLTableElement, selectAllId: string) {
  if (table.dataset.selectAllBound === "true") return;
  table.dataset.selectAllBound = "true";

  table.addEventListener("change", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLInputElement) || target.id !== selectAllId) return;
    table.querySelectorAll(".row-select").forEach((el) => {
      if (el instanceof HTMLInputElement) el.checked = target.checked;
    });
  });
}

function syncServerOrder(
  dt: DataTables.Api,
  config: DataListTableConfig,
  displayColumnKeys: string[],
) {
  const template = config.orderUrlTemplate;
  const sortableKeys = config.sortableColumnKeys;
  if (!template || !sortableKeys?.length) return;

  const columnIndexOffset = config.selectable ? 1 : 0;
  const entries = dt
    .order()
    .map(([columnIndex, dir]) => {
      const displayIndex = columnIndex - columnIndexOffset;
      const column = displayColumnKeys[displayIndex];
      if (!column || !sortableKeys.includes(column)) return null;
      return { column, dir: dir === "asc" ? "asc" : "desc" } as const;
    })
    .filter((entry): entry is { column: string; dir: "asc" | "desc" } => entry != null);

  if (entries.length === 0) return;

  const serialized = serializeDataListOrder(entries);
  const url = template
    .replace("__ORDER__", serialized.order)
    .replace("__ORDER_DIR__", serialized.orderDir);
  window.location.assign(url);
}

async function loadDataTableDeps() {
  const [{ default: DataTable }, { default: jQuery }] = await Promise.all([
    import("datatables.net-dt"),
    import("jquery"),
  ]);
  Object.assign(window, { $: jQuery, jQuery });
  return DataTable;
}

function destroyDataListTable(table: HTMLTableElement): void {
  if (table.id) {
    const existing = tableApis.get(table.id);
    existing?.destroy();
    tableApis.delete(table.id);
  }
  delete table.dataset.dtInitialized;
}

export async function initDataListTable(
  table: HTMLTableElement,
  config: DataListTableConfig,
): Promise<DataTables.Api | null> {
  if (table.dataset.dtInitialized === "true") {
    destroyDataListTable(table);
  }

  const displayColumnKeys = table.dataset.displayColumnKeys?.split("|").filter(Boolean) ?? [];

  const DataTable = await loadDataTableDeps();
  const clientFeatures = !config.serverPagination;
  const pageLength = normalizeDataListPageLength(config.pageLength);
  const orderingEnabled =
    clientFeatures || (config.serverBackedOrder && (config.sortableColumnKeys?.length ?? 0) > 0);

  const dt = new DataTable(table, {
    paging: clientFeatures,
    searching: true,
    ordering: orderingEnabled,
    orderMulti: true,
    info: clientFeatures,
    lengthChange: true,
    pageLength,
    lengthMenu,
    order: config.initialOrder?.length ? config.initialOrder : undefined,
    autoWidth: false,
    language: {
      emptyTable: config.emptyMessage,
    },
    columnDefs: buildColumnDefs(config),
    layout: {
      topStart: "pageLength",
      topEnd: "search",
      bottomStart: clientFeatures ? "info" : null,
      bottomEnd: clientFeatures ? "paging" : null,
    },
  });

  if (config.serverPagination && config.limitUrlTemplate) {
    const template = config.limitUrlTemplate;
    dt.on("length.dt", () => {
      const url = template.replace(
        "__LIMIT__",
        String(normalizeDataListPageLength(dt.page.len())),
      );
      window.location.assign(url);
    });
  }

  if (config.serverBackedOrder && config.orderUrlTemplate) {
    let skipOrderEvent = true;
    dt.on("order.dt", () => {
      if (skipOrderEvent) {
        skipOrderEvent = false;
        return;
      }
      syncServerOrder(dt, config, displayColumnKeys);
    });
  }

  table.dataset.dtInitialized = "true";
  registerDataListTableApi(table, dt);

  if (config.selectAllId) {
    bindSelectAll(table, config.selectAllId);
  }

  return dt;
}

export async function initDataListTables(): Promise<void> {
  const tables = document.querySelectorAll<HTMLTableElement>("table[data-dt-config]");
  await Promise.all(
    [...tables].map(async (table) => {
      const raw = table.getAttribute("data-dt-config");
      if (!raw) return;
      try {
        const config = JSON.parse(raw) as DataListTableConfig;
        await initDataListTable(table, config);
      } catch {
        /* ignore invalid config */
      }
    }),
  );
}

function boot() {
  void initDataListTables();
}

function bindHtmxRowFadeOut() {
  document.body.addEventListener("htmx:beforeRequest", (ev) => {
    const evt = ev;
    const el = "detail" in evt && evt.detail?.elt;
    if (el?.getAttribute?.("hx-delete")) {
      const tr = el.closest("tr");
      if (tr) tr.classList.add("data-list-row-fade-out");
    }
  });
}

if (typeof document !== "undefined") {
  bindHtmxRowFadeOut();
  document.addEventListener("DOMContentLoaded", boot);
  document.addEventListener("astro:page-load", boot);
}
