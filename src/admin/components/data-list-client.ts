export interface DataListActionsHtmlOptions {
  editLink: string;
  deletePath?: string;
  deleteConfirm: string;
  duplicatePath?: string;
  editLabel?: string;
  deleteLabel?: string;
  duplicateLabel?: string;
  actionsLabel?: string;
}

export const tableApis = new Map<string, DataTables.Api>();

export function registerDataListTableApi(table: HTMLTableElement, api: DataTables.Api): void {
  if (table.id) tableApis.set(table.id, api);
}

export function getDataListTable(root: HTMLElement | string): HTMLTableElement | null {
  const el = typeof root === "string" ? document.getElementById(root) : root;
  return el?.querySelector<HTMLTableElement>("table[data-dt-config]") ?? null;
}

export function getDataListApi(root: HTMLElement | string): DataTables.Api | null {
  const table = getDataListTable(root);
  if (!table?.id) return null;
  return tableApis.get(table.id) ?? null;
}

export function buildDataListActionsHtml(options: DataListActionsHtmlOptions): string {
  const editLabel = options.editLabel ?? "Editar";
  const deleteLabel = options.deleteLabel ?? "Deletar";
  const duplicateLabel = options.duplicateLabel ?? "Duplicar";
  const actionsLabel = options.actionsLabel ?? "Actions";

  const duplicateBtn = options.duplicatePath
    ? `<li><button type="button" class="text-sm w-full text-left" hx-post="${options.duplicatePath}" hx-swap="none">${duplicateLabel}</button></li>`
    : "";

  const deleteBtn = options.deletePath
    ? `<li><button type="button" class="text-sm text-error w-full text-left" hx-delete="${options.deletePath}" hx-confirm="${escapeAttr(options.deleteConfirm)}" hx-swap="none">${deleteLabel}</button></li>`
    : "";

  return (
    `<div class="dropdown dropdown-end flex justify-start">` +
    `<label tabindex="0" class="btn btn-sm">${actionsLabel}</label>` +
    `<ul tabindex="0" class="dropdown-content menu bg-base-100 rounded-box z-50 w-40 border border-base-300 p-1 shadow-lg">` +
    `<li><a href="${options.editLink}" class="text-sm text-blue-600 focus:text-white">${editLabel}</a></li>` +
    duplicateBtn +
    deleteBtn +
    `</ul></div>`
  );
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function processHtmx(node: HTMLElement): void {
  const htmxLib = typeof globalThis !== "undefined" && (globalThis as { htmx?: { process?: (el: Element) => void } }).htmx;
  htmxLib?.process?.(node);
}

export function addDataListRow(
  root: HTMLElement | string,
  cellValues: string[],
  actionsHtml?: string,
): void {
  const table = getDataListTable(root);
  const api = table ? getDataListApi(root) : null;
  if (!table || !api) return;

  const tr = document.createElement("tr");

  tr.innerHTML =
    cellValues.map((value) => `<td>${value}</td>`).join("") +
    (actionsHtml ? `<td class="text-center">${actionsHtml}</td>` : "");

  const jQuery = (window as Window & { $?: (node: HTMLElement) => unknown }).$;
  if (jQuery) {
    api.row.add(jQuery(tr)).draw(false);
  } else {
    api.row.add(tr).draw(false);
  }
  processHtmx(tr);
}

export function updateDataListRowByEditId(
  root: HTMLElement | string,
  id: string | number,
  cellValues: string[],
): void {
  const table = getDataListTable(root);
  if (!table) return;

  const idStr = String(id);
  for (const row of table.querySelectorAll("tbody tr")) {
    const editLink = row.querySelector('a[href*="action=edit"][href*="id="]');
    const href = editLink?.getAttribute("href");
    if (!href) continue;
    const match = href.match(/[?&]id=(\d+)(?:&|$)/);
    if (!match || match[1] !== idStr) continue;

    const cells = row.querySelectorAll("td");
    cellValues.forEach((value, index) => {
      if (cells[index]) cells[index].textContent = value;
    });
    break;
  }
}

export function removeDataListRow(row: HTMLElement): void {
  const table = row.closest<HTMLTableElement>("table[data-dt-config]");
  const api = table?.id ? tableApis.get(table.id) : null;
  if (api) {
    api.row(row).remove().draw(false);
    return;
  }
  row.remove();
}

export interface EdgepressDataListApi {
  getDataListApi: typeof getDataListApi;
  addDataListRow: typeof addDataListRow;
  updateDataListRowByEditId: typeof updateDataListRowByEditId;
  removeDataListRow: typeof removeDataListRow;
  buildDataListActionsHtml: typeof buildDataListActionsHtml;
}

declare global {
  interface Window {
    edgepressDataList?: EdgepressDataListApi;
  }
}

if (typeof window !== "undefined") {
  window.edgepressDataList = {
    getDataListApi,
    addDataListRow,
    updateDataListRowByEditId,
    removeDataListRow,
    buildDataListActionsHtml,
  };
}
