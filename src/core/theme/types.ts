export type ThemeRouteKind = "home" | "single" | "page" | "archive" | "404";

export type ThemeManifest = {
  name: string;
  slug: string;
  version: string;
  engine: "liquid";
  supports: string[];
  templates: Partial<Record<ThemeRouteKind, string>>;
  layout?: string;
  assets_dir?: string;
  /** Translation key or slug for the home page content */
  home_content_key?: string;
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
  };
  body_class: string;
  /** Language switcher links (pt-br, en). */
  locale_switcher: LocaleSwitcherItem[];
  post?: ThemePostView;
  posts?: ThemePostView[];
  archive?: {
    title: string;
    type: string;
  };
  pagination?: ThemePagination;
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
};
