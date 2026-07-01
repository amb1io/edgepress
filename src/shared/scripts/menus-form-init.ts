/**
 * Alpine form for menus CPT: item builder with autocomplete, custom links, drag-drop.
 */
import {
  initContentForm,
  deleteContentThumbnail,
  type ContentFormInitProps,
} from "./content-form.ts";

export type MenuItemClientRow = {
  clientId: string;
  id?: number;
  label: string;
  slug: string;
  order: number;
  link_type: "post" | "custom" | "taxonomy";
  target_post_id?: number | null;
  target_post_type?: string;
  target_slug?: string;
  target_locale_code?: string;
  target_taxonomy_id?: number | null;
  target_taxonomy_type?: string;
  custom_url?: string;
  id_locale_code?: number | null;
};

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
  return items.map((item, index) => ({
    ...item,
    clientId: item.clientId || nextClientId(),
    order: item.order || index + 1,
  }));
}

function syncOrders(items: MenuItemClientRow[]): MenuItemClientRow[] {
  return items.map((item, index) => ({ ...item, order: index + 1 }));
}

function safeStr(v: unknown): string {
  if (typeof v === "string" && !v.includes("[object ")) return v.trim();
  return "";
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
      dragIndex: null as number | null,

      init() {
        this.$watch("items", () => this.syncHiddenField());
        this.syncHiddenField();
      },

      syncHiddenField() {
        const input = document.querySelector<HTMLInputElement>(
          'input[name="menu_items_data"]',
        );
        if (!input) return;
        const payload = this.items.map((item: MenuItemClientRow) => ({
          ...(item.id ? { id: item.id } : {}),
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
        }));
        input.value = JSON.stringify(payload);
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
        this.items = syncOrders([
          ...this.items,
          {
            clientId: nextClientId(),
            label,
            slug,
            order: this.items.length + 1,
            link_type: "custom",
            custom_url: url,
          },
        ]);
        this.showCustomForm = false;
        this.customName = "";
        this.customUrl = "";
      },

      selectPickerResult(result: MenuPickerResult) {
        if (result.kind === "taxonomy") {
          this.items = syncOrders([
            ...this.items,
            {
              clientId: nextClientId(),
              label: result.title,
              slug: result.slug,
              order: this.items.length + 1,
              link_type: "taxonomy",
              target_taxonomy_id: result.id,
              target_taxonomy_type: result.taxonomy_type,
              target_slug: result.slug,
              target_locale_code: result.locale_code,
              id_locale_code: result.id_locale_code,
            },
          ]);
        } else {
          this.items = syncOrders([
            ...this.items,
            {
              clientId: nextClientId(),
              label: result.title,
              slug: result.slug,
              order: this.items.length + 1,
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
        this.items = syncOrders(
          this.items.filter((item: MenuItemClientRow) => item.clientId !== clientId),
        );
      },

      updateOrder(clientId: string, value: string) {
        const order = Math.max(1, parseInt(value, 10) || 1);
        const sorted = [...this.items].sort(
          (a: MenuItemClientRow, b: MenuItemClientRow) => a.order - b.order,
        );
        const index = sorted.findIndex(
          (item: MenuItemClientRow) => item.clientId === clientId,
        );
        if (index < 0) return;
        const [moved] = sorted.splice(index, 1);
        if (!moved) return;
        sorted.splice(Math.min(order - 1, sorted.length), 0, moved);
        this.items = syncOrders(sorted);
      },

      onDragStart(index: number) {
        this.dragIndex = index;
      },

      onDragOver(event: DragEvent) {
        event.preventDefault();
      },

      onDrop(index: number) {
        if (this.dragIndex == null || this.dragIndex === index) {
          this.dragIndex = null;
          return;
        }
        const sorted = [...this.items].sort(
          (a: MenuItemClientRow, b: MenuItemClientRow) => a.order - b.order,
        );
        const [moved] = sorted.splice(this.dragIndex, 1);
        if (!moved) {
          this.dragIndex = null;
          return;
        }
        sorted.splice(index, 0, moved);
        this.items = syncOrders(sorted);
        this.dragIndex = null;
      },

      sortedItems(): MenuItemClientRow[] {
        return [...this.items].sort(
          (a: MenuItemClientRow, b: MenuItemClientRow) => a.order - b.order,
        );
      },

      itemTypeLabel(item: MenuItemClientRow): string {
        if (item.link_type === "custom") return this.labels.typeCustom;
        if (item.link_type === "taxonomy") return this.labels.typeTaxonomy;
        return this.labels.typePost;
      },
    }));
  });
}

window.deleteContentThumbnail = deleteContentThumbnail;

const props = (window.__menusFormProps || {}) as MenusFormInitProps;
initMenusForm(props);
