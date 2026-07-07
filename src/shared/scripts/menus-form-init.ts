/**
 * Alpine form for menus CPT: item builder with autocomplete, custom links, SortableJS submenus.
 */
import Sortable from "sortablejs";
import {
  initContentForm,
  deleteContentThumbnail,
  type ContentFormInitProps,
} from "./content-form.ts";
import type { MenuItemClientRow, SubMenuDisplay, SubMenuSort } from "./menu-item-types.ts";
import {
  childrenOfFrom,
  nextChildOrder,
  nextRootOrder,
  normalizeSiblingOrders,
  reorderChildrenIn,
  reorderRootsIn,
  rootItemsFrom,
} from "./menus-form-order.ts";

export type { MenuItemClientRow, SubMenuDisplay, SubMenuSort } from "./menu-item-types.ts";
export {
  childrenOfFrom,
  normalizeSiblingOrders,
  reorderChildrenIn,
  reorderRootsIn,
  rootItemsFrom,
} from "./menus-form-order.ts";

export type MenuPickerResult =
  | {
      kind: "post";
      id: number;
      title: string;
      slug: string;
      post_type_slug: string;
      locale_code: string;
      id_locale_code: number | null;
    }
  | {
      kind: "taxonomy";
      id: number;
      title: string;
      slug: string;
      taxonomy_type: string;
      locale_code: string;
      id_locale_code: number | null;
    };

export type MenusFormInitProps = ContentFormInitProps & {
  locale: string;
  initialMenuItems: MenuItemClientRow[];
  labels: {
    customOption: string;
    customName: string;
    customUrl: string;
    order: string;
    searchPosts: string;
    addItem: string;
    remove: string;
    typePost: string;
    typeCustom: string;
    typeTaxonomy: string;
    selectPost: string;
    parentMenu: string;
    noParent: string;
    sortAlphabetical: string;
    sortCreation: string;
    displayTitle: string;
    displayThumbnail: string;
    displayExcerpt: string;
    submenuOptions: string;
    submenuSort: string;
    submenuDisplay: string;
  };
};

declare global {
  interface Window {
    __menusFormProps?: MenusFormInitProps;
    deleteContentThumbnail?: typeof deleteContentThumbnail;
  }
}

function nextClientId(): string {
  return `menu-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeMenuItems(items: MenuItemClientRow[]): MenuItemClientRow[] {
  const normalized = items.map((item, index) => ({
    ...item,
    clientId: item.clientId || nextClientId(),
    order: item.order || index + 1,
    submenu_sort: item.submenu_sort ?? "creation",
    submenu_display: item.submenu_display ?? ["title"],
    parentClientId: item.parentClientId ?? null,
    parentMenuItemId: item.parentMenuItemId ?? null,
  }));
  return normalizeSiblingOrders(normalized);
}

function safeStr(v: unknown): string {
  if (typeof v === "string" && !v.includes("[object ")) return v.trim();
  return "";
}

function readSortableOrder(listEl: HTMLElement | null): string[] {
  if (!listEl) return [];
  const sortable = Sortable.get(listEl);
  return sortable ? sortable.toArray() : [];
}

export function initMenusForm(props: MenusFormInitProps): void {
  initContentForm(props);

  const {
    initialTitle,
    initialSlug,
    initialExcerpt = "",
    initialStatus,
    initialAuthorId,
    initialOrder = "",
    thumbnailPath = "",
    thumbnailUrl = "",
    initialThumbnailAttachmentId = 0,
  } = props;

  document.addEventListener("alpine:init", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Alpine.data("menusForm", () => ({
      title: safeStr(initialTitle),
      slug: safeStr(initialSlug),
      excerpt: safeStr(initialExcerpt),
      status: String(initialStatus || "draft"),
      author_id: String(initialAuthorId || ""),
      order: safeStr(initialOrder),
      thumbnail_path: String(thumbnailPath || ""),
      thumbnail_url: String(thumbnailUrl || ""),
      thumbnail_attachment_id:
        initialThumbnailAttachmentId && initialThumbnailAttachmentId > 0
          ? initialThumbnailAttachmentId
          : null,
      blocknote_attachment_ids: [] as number[],
      notification: {
        show: false,
        type: "error",
        message: "",
        title: "",
      },
      showNotification(type: string, message: string, title = "") {
        this.notification = { show: true, type, message, title };
      },
      hideNotification() {
        this.notification.show = false;
      },
      locale: props.locale,
      labels: props.labels,
      items: normalizeMenuItems(props.initialMenuItems ?? []),
      pickerOpen: false,
      pickerSearch: "",
      pickerResults: [] as MenuPickerResult[],
      pickerLoading: false,
      showCustomForm: false,
      customName: "",
      customUrl: "",
      _rootSortable: null as Sortable | null,

      init() {
        this.$watch("items", () => this.syncHiddenField());
        this.syncHiddenField();
        this.$nextTick(() => this.initRootSortable());
      },

      syncHiddenField() {
        const input = document.querySelector<HTMLInputElement>(
          'input[name="menu_items_data"]',
        );
        if (!input) return;
        const payload = this.items.map((item: MenuItemClientRow) => ({
          ...(item.id ? { id: item.id } : {}),
          client_id: item.clientId,
          label: item.label,
          slug: item.slug,
          order: item.order,
          link_type: item.link_type,
          target_post_id: item.target_post_id ?? null,
          target_post_type: item.target_post_type ?? "",
          target_slug: item.target_slug ?? "",
          target_locale_code: item.target_locale_code ?? "",
          target_taxonomy_id: item.target_taxonomy_id ?? null,
          target_taxonomy_type: item.target_taxonomy_type ?? "",
          custom_url: item.custom_url ?? "",
          id_locale_code: item.id_locale_code ?? null,
          parent_menu_item_id: item.parentMenuItemId ?? null,
          parent_client_id: item.parentClientId ?? null,
          submenu_sort: item.submenu_sort ?? "creation",
          submenu_display: item.submenu_display ?? ["title"],
        }));
        input.value = JSON.stringify(payload);
      },

      initRootSortable() {
        const rootList = this.$refs.rootList as HTMLElement | undefined;
        if (!rootList) return;
        if (this._rootSortable) {
          this._rootSortable.destroy();
        }
        this._rootSortable = Sortable.create(rootList, {
          group: "menu-roots",
          handle: ".drag-handle",
          animation: 150,
          dataIdAttr: "data-id",
          draggable: ".menu-root-block",
          onEnd: () => {
            if (!this._rootSortable) return;
            this.reorderRoots(this._rootSortable.toArray());
          },
        });
      },

      initChildrenSortable(el: HTMLElement) {
        const existing = Sortable.get(el);
        if (existing) existing.destroy();

        Sortable.create(el, {
          group: "menu-children",
          handle: ".drag-handle",
          animation: 150,
          dataIdAttr: "data-id",
          draggable: ".menu-child-block",
          onEnd: (evt) => this.handleChildDrop(evt),
        });
      },

      handleChildDrop(evt: Sortable.SortableEvent) {
        const toEl = evt.to as HTMLElement;
        const fromEl = evt.from as HTMLElement;
        const toParent = toEl.dataset.parentClientId;
        if (!toParent) return;

        this.reorderChildren(toParent, readSortableOrder(toEl));

        const fromParent = fromEl.dataset.parentClientId;
        if (fromParent && fromParent !== toParent) {
          this.reorderChildren(fromParent, readSortableOrder(fromEl));
        }
      },

      rootItems(): MenuItemClientRow[] {
        return rootItemsFrom(this.items);
      },

      childrenOf(parentClientId: string): MenuItemClientRow[] {
        return childrenOfFrom(this.items, parentClientId);
      },

      reorderRoots(orderedClientIds: string[]) {
        this.items = reorderRootsIn(this.items, orderedClientIds);
      },

      reorderChildren(parentClientId: string, orderedClientIds: string[]) {
        this.items = reorderChildrenIn(
          this.items,
          parentClientId,
          orderedClientIds,
        );
      },

      togglePicker() {
        this.pickerOpen = !this.pickerOpen;
        if (this.pickerOpen && this.pickerSearch.trim()) {
          void this.searchPosts();
        }
      },

      async searchPosts() {
        const q = this.pickerSearch.trim();
        if (!q) {
          this.pickerResults = [];
          return;
        }
        this.pickerLoading = true;
        try {
          const res = await fetch(
            `/api/admin/posts-search?q=${encodeURIComponent(q)}&locale=${encodeURIComponent(this.locale)}&limit=20`,
          );
          if (!res.ok) {
            this.pickerResults = [];
            return;
          }
          const data = (await res.json()) as { items?: MenuPickerResult[] };
          this.pickerResults = data.items ?? [];
        } catch {
          this.pickerResults = [];
        } finally {
          this.pickerLoading = false;
        }
      },

      chooseCustomOption() {
        this.pickerOpen = false;
        this.showCustomForm = true;
        this.customName = "";
        this.customUrl = "";
      },

      confirmCustomItem() {
        const label = this.customName.trim();
        const url = this.customUrl.trim();
        if (!label || !url) return;
        const slug =
          (window.slugify && window.slugify(label)) ||
          label.toLowerCase().replace(/\s+/g, "-");
        this.items = normalizeSiblingOrders([
          ...this.items,
          {
            clientId: nextClientId(),
            label,
            slug,
            order: nextRootOrder(this.items),
            link_type: "custom",
            custom_url: url,
            submenu_sort: "creation",
            submenu_display: ["title"],
          },
        ]);
        this.showCustomForm = false;
        this.customName = "";
        this.customUrl = "";
      },

      selectPickerResult(result: MenuPickerResult) {
        const base = {
          clientId: nextClientId(),
          label: result.title,
          slug: result.slug,
          order: nextRootOrder(this.items),
          submenu_sort: "creation" as SubMenuSort,
          submenu_display: ["title"] as SubMenuDisplay[],
        };
        if (result.kind === "taxonomy") {
          this.items = normalizeSiblingOrders([
            ...this.items,
            {
              ...base,
              link_type: "taxonomy",
              target_taxonomy_id: result.id,
              target_taxonomy_type: result.taxonomy_type,
              target_slug: result.slug,
              target_locale_code: result.locale_code,
              id_locale_code: result.id_locale_code,
            },
          ]);
        } else {
          this.items = normalizeSiblingOrders([
            ...this.items,
            {
              ...base,
              link_type: "post",
              target_post_id: result.id,
              target_post_type: result.post_type_slug,
              target_slug: result.slug,
              target_locale_code: result.locale_code,
              id_locale_code: result.id_locale_code,
            },
          ]);
        }
        this.pickerOpen = false;
        this.pickerSearch = "";
        this.pickerResults = [];
      },

      resultSubtitle(result: MenuPickerResult): string {
        if (result.kind === "taxonomy") {
          return `${result.taxonomy_type} · ${result.slug}`;
        }
        return `${result.post_type_slug} · ${result.slug}`;
      },

      removeItem(clientId: string) {
        const childIds = this.items
          .filter((item: MenuItemClientRow) => item.parentClientId === clientId)
          .map((item: MenuItemClientRow) => item.clientId);
        this.items = normalizeSiblingOrders(
          this.items.filter(
            (item: MenuItemClientRow) =>
              item.clientId !== clientId && !childIds.includes(item.clientId),
          ),
        );
      },

      updateOrder(clientId: string, value: string) {
        const item = this.items.find(
          (row: MenuItemClientRow) => row.clientId === clientId,
        );
        if (!item) return;

        const targetOrder = Math.max(1, parseInt(value, 10) || 1);

        if (!item.parentClientId) {
          const ids = this.rootItems().map((row) => row.clientId);
          const currentIdx = ids.indexOf(clientId);
          if (currentIdx < 0) return;
          ids.splice(currentIdx, 1);
          ids.splice(Math.min(targetOrder - 1, ids.length), 0, clientId);
          this.reorderRoots(ids);
          return;
        }

        const ids = this.childrenOf(item.parentClientId).map((row) => row.clientId);
        const currentIdx = ids.indexOf(clientId);
        if (currentIdx < 0) return;
        ids.splice(currentIdx, 1);
        ids.splice(Math.min(targetOrder - 1, ids.length), 0, clientId);
        this.reorderChildren(item.parentClientId, ids);
      },

      availableParents(childClientId: string): MenuItemClientRow[] {
        return this.items.filter(
          (item: MenuItemClientRow) =>
            item.clientId !== childClientId &&
            !item.parentClientId &&
            !this.isDescendantOf(childClientId, item.clientId),
        );
      },

      isDescendantOf(ancestorClientId: string, candidateClientId: string): boolean {
        let current = this.items.find(
          (item: MenuItemClientRow) => item.clientId === candidateClientId,
        );
        while (current?.parentClientId) {
          if (current.parentClientId === ancestorClientId) return true;
          current = this.items.find(
            (item: MenuItemClientRow) => item.clientId === current!.parentClientId,
          );
        }
        return false;
      },

      setParent(childClientId: string, parentClientId: string | null) {
        const item = this.items.find(
          (row: MenuItemClientRow) => row.clientId === childClientId,
        );
        if (!item) return;

        if (!parentClientId) {
          this.items = normalizeSiblingOrders(
            this.items.map((row: MenuItemClientRow) => {
              if (row.clientId !== childClientId) return row;
              return {
                ...row,
                parentClientId: null,
                parentMenuItemId: null,
                order: nextRootOrder(
                  this.items.filter((r) => r.clientId !== childClientId),
                ),
              };
            }),
          );
          return;
        }

        const parent = this.items.find(
          (row: MenuItemClientRow) => row.clientId === parentClientId,
        );
        this.items = normalizeSiblingOrders(
          this.items.map((row: MenuItemClientRow) => {
            if (row.clientId !== childClientId) return row;
            return {
              ...row,
              parentClientId,
              parentMenuItemId: parent?.id ?? null,
              order: nextChildOrder(
                this.items.filter((r) => r.clientId !== childClientId),
                parentClientId,
              ),
            };
          }),
        );
      },

      hasChildren(clientId: string): boolean {
        return this.items.some(
          (item: MenuItemClientRow) => item.parentClientId === clientId,
        );
      },

      toggleSubmenuDisplay(clientId: string, value: SubMenuDisplay, checked: boolean) {
        this.items = this.items.map((item: MenuItemClientRow) => {
          if (item.clientId !== clientId) return item;
          const current = new Set(item.submenu_display ?? ["title"]);
          if (checked) current.add(value);
          else current.delete(value);
          if (current.size === 0) current.add("title");
          return { ...item, submenu_display: [...current] as SubMenuDisplay[] };
        });
      },

      setSubmenuSort(clientId: string, value: SubMenuSort) {
        this.items = this.items.map((item: MenuItemClientRow) =>
          item.clientId === clientId ? { ...item, submenu_sort: value } : item,
        );
      },

      itemTypeLabel(item: MenuItemClientRow): string {
        if (item.link_type === "custom") return this.labels.typeCustom;
        if (item.link_type === "taxonomy") return this.labels.typeTaxonomy;
        return this.labels.typePost;
      },

      isSubItem(item: MenuItemClientRow): boolean {
        return Boolean(item.parentClientId);
      },
    }));
  });
}

window.deleteContentThumbnail = deleteContentThumbnail;

const props = (window.__menusFormProps || {}) as MenusFormInitProps;
initMenusForm(props);
