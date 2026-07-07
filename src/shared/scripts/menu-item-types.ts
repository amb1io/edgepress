export type SubMenuSort = "alphabetical" | "creation";
export type SubMenuDisplay = "title" | "thumbnail" | "excerpt";

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
  parentClientId?: string | null;
  parentMenuItemId?: number | null;
  submenu_sort?: SubMenuSort;
  submenu_display?: SubMenuDisplay[];
};
