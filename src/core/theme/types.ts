export type ThemeRouteKind = "home" | "single" | "page" | "archive" | "taxonomy" | "search" | "404";

export type ThemeManifest = {
  name: string;
  slug: string;
  version: string;
  engine: "liquid";
  supports: string[];
  /** Optional route hints; resolver auto-discovers templates in the package by WordPress-style names. */
  templates: Record<string, string>;
  layout?: string;
  assets_dir?: string;
  /** Translation key or slug for the home page content */
  home_content_key?: string;
  /** When true, home is a post listing (`posts`); when false/absent, home uses `home_content_key` as singular content */
  home_list_posts?: boolean;
};

export type ThemePackageRecord = {
  manifest: ThemeManifest;
  /** Template key (e.g. `home`, `parts/header`) -> Liquid source */
  templates: Record<string, string>;
  updated_at: number;
};

export type MenuItem = {
  label: string;
  url: string;
  active: boolean;
};

export type ThemeTaxonomyView = {
  name: string;
  slug: string;
};

export type ThemeAuthorView = {
  name: string;
  image: string;
  description: string;
};

export type ThemePostView = {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  body_html: string;
  author_name: string;
  published_at: number | null;
  post_type_slug: string;
  cover_image?: string;
  meta: Record<string, string>;
};

export type ThemePagination = {
  page: number;
  total_pages: number;
  prev_url?: string;
  next_url?: string;
};

export type ThemeSeoContext = {
  title: string;
  description: string;
  canonical: string;
  og_image?: string;
  og_type: string;
  site_name?: string;
  json_ld_html?: string;
};

export type ThemeSiteContext = {
  title: string;
  description: string;
  locale: string;
  /** URL prefix for the active locale (`""` or `/en`). */
  locale_prefix: string;
  /** Home URL for the active locale (`/` or `/en`). */
  home_url: string;
  base_url: string;
  html_lang: string;
  year: number;
};

export type LocaleSwitcherItem = {
  code: string;
  label: string;
  flag: string;
  url: string;
  active: boolean;
};

export type ThemeRenderContext = {
  site: ThemeSiteContext;
  seo: ThemeSeoContext;
  menus: Record<string, MenuItem[]>;
  theme: {
    slug: string;
    version: string;
    asset_base_url: string;
  };
  route: {
    kind: ThemeRouteKind;
    path: string;
    locale: string;
    /** DB taxonomy type when `kind` is `taxonomy` (e.g. `category`). */
    taxonomy_type?: string;
    /** Term slug when `kind` is `taxonomy` (e.g. `visum`). */
    taxonomy_slug?: string;
  };
  body_class: string;
  /** Language switcher links (pt-br, en). */
  locale_switcher: LocaleSwitcherItem[];
  /** Current post or page when applicable (slug route or home content). */
  post?: ThemePostView;
  /** Published posts list (always populated). */
  posts: ThemePostView[];
  /** Archive metadata (always populated). */
  archive: {
    title: string;
    type: string;
  };
  /** Pagination for the posts list (always populated). */
  pagination: ThemePagination;
  /** WordPress-style conditional flags (always populated). */
  is_front_page: boolean;
  is_single: boolean;
  is_page: boolean;
  is_singular: boolean;
  is_archive: boolean;
  is_search: boolean;
  is_404: boolean;
  /** Search metadata when `route.kind` is `search`. */
  search?: {
    query: string;
    total: number;
  };
  have_posts: boolean;
  /** Fetch taxonomy terms for a post type (used by {% get_taxonomies %} tag). */
  get_taxonomies?: (postType: string, taxonomyType: string) => Promise<ThemeTaxonomyView[]>;
  /** Fetch related posts by shared category (used by {% get_related_posts %} tag). */
  get_related_posts?: (idOrSlug: string | number, limit?: number) => Promise<ThemePostView[]>;
  /** Fetch author for a post (used by {% get_author %} tag). */
  get_author?: (idOrSlug: string | number) => Promise<ThemeAuthorView | null>;
  /** Injected by layout wrapper */
  content?: string;
};

export type ResolvedPublicRoute = {
  kind: ThemeRouteKind;
  locale: string;
  path: string;
  slug?: string;
  postType?: string;
  page?: number;
  taxonomyType?: string;
  taxonomySlug?: string;
  taxonomyBase?: string;
  /** Search term from `?q=` when `kind` is `search`. */
  searchQuery?: string;
};
