import {
  ContentBadRequestError,
  ContentNotFoundError,
  createEdgepressContent,
  type ContentPostDetail,
} from "../services/edgepress-content.ts";
import { getSettingsFromDb } from "../services/settings-service.ts";
import {
  getTranslationSlugsByKey,
  type TranslationSlugRow,
} from "../services/post-translation-service.ts";
import { db } from "../../db/index.ts";
import { getKvFromLocals } from "../../utils/runtime-locals.ts";
import { adminUrlLocaleToDbCode } from "../../utils/admin-locale-constants.ts";
import type {
  LocaleSwitcherItem,
  MenuItem,
  ResolvedPublicRoute,
  ThemePackageRecord,
  ThemePostView,
  ThemeRenderContext,
  ThemeRouteKind,
} from "./types.ts";
import { buildSeoFromPost } from "./seo-head.ts";
import {
  localeToHtmlLang,
  normalizePublicLocale,
  publicLocaleHomeUrl,
  publicLocaleUrlPrefix,
} from "./resolve-route.ts";

type CustomFieldRow = { name?: string; value?: string; type?: string };
type CustomFieldItem = { title?: string; fields?: CustomFieldRow[] };

function normalizeTitle(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function getMenuItemsFromPost(
  post: { custom_fields?: CustomFieldItem[] },
  customFieldTitle: string,
  currentPath: string,
): MenuItem[] {
  const blocks = Array.isArray(post.custom_fields) ? post.custom_fields : [];
  const block = blocks.find((b) => normalizeTitle(b?.title) === normalizeTitle(customFieldTitle));
  const rows = Array.isArray(block?.fields) ? block!.fields! : [];

  return rows
    .map((r) => {
      const label = String(r?.name ?? "").trim();
      const url = String(r?.value ?? "").trim();
      return {
        label,
        url,
        active: url !== "" && currentPath === url.replace(/\/+$/, ""),
      };
    })
    .filter((x) => x.label !== "" && x.url !== "");
}

function resolveOgImage(post: ContentPostDetail, baseUrl: string): string | undefined {
  const media = Array.isArray(post.media) ? post.media : [];
  const metaValues = (post.meta_values ?? {}) as Record<string, unknown>;
  const thumbIdRaw = metaValues["post_thumbnail_id"];
  const thumbId =
    typeof thumbIdRaw === "number"
      ? thumbIdRaw
      : typeof thumbIdRaw === "string"
        ? parseInt(thumbIdRaw, 10)
        : NaN;

  for (const item of media) {
    const row = item as { id?: number; meta_values?: Record<string, unknown> };
    const id = row.id;
    if (thumbId && !Number.isNaN(thumbId) && id !== thumbId) continue;
    const meta = row.meta_values ?? {};
    const path =
      (typeof meta["attachment_path"] === "string" && meta["attachment_path"]) ||
      (typeof meta["attachment_file"] === "string" && meta["attachment_file"]) ||
      "";
    if (!path) continue;
    if (/^https?:\/\//i.test(path)) return path;
    const normalized = path.startsWith("/") ? path : `/uploads/${path.replace(/^uploads\//, "")}`;
    return new URL(`/api/media${normalized}`, baseUrl).href;
  }
  return undefined;
}

function toPostView(post: ContentPostDetail, baseUrl: string): ThemePostView {
  const metaValues = (post.meta_values ?? {}) as Record<string, unknown>;
  const meta: Record<string, string> = {};
  for (const [k, v] of Object.entries(metaValues)) {
    if (v != null) meta[k] = String(v);
  }

  return {
    id: Number(post.id),
    title: String(post.title ?? ""),
    slug: String(post.slug ?? ""),
    excerpt: String(post.excerpt ?? ""),
    body_html: String(post.body ?? ""),
    author_name: String((post as { author_name?: string }).author_name ?? ""),
    published_at:
      typeof post.published_at === "number"
        ? post.published_at
        : post.published_at
          ? Date.parse(String(post.published_at))
          : null,
    post_type_slug: String(post.post_type_slug ?? "post"),
    cover_image: resolveOgImage(post, baseUrl),
    meta,
  };
}

function buildBodyClass(route: ResolvedPublicRoute, post?: ThemePostView): string {
  const parts = [`route-${route.kind}`, `locale-${route.locale.replace(/-/g, "_")}`];
  if (post?.post_type_slug) parts.push(`type-${post.post_type_slug}`);
  if (post?.slug) parts.push(`slug-${post.slug.replace(/\//g, "-")}`);
  return parts.join(" ");
}

const LOCALE_SWITCHER_META: ReadonlyArray<{ code: string; flag: string; label: string }> = [
  { code: "pt-br", flag: "🇧🇷", label: "PT" },
  { code: "en", flag: "🇺🇸", label: "EN" },
];

async function buildLocaleSwitcher(
  currentLocale: string,
  resolvedKind: ThemeRouteKind,
  post: ThemePostView | undefined,
  homeTranslationKey: string | undefined,
): Promise<LocaleSwitcherItem[]> {
  let siblings: TranslationSlugRow[] = [];
  const translationKey =
    resolvedKind === "home"
      ? homeTranslationKey
      : post?.meta?.translation_key;

  if (
    translationKey &&
    (resolvedKind === "home" || resolvedKind === "single" || resolvedKind === "page")
  ) {
    siblings = await getTranslationSlugsByKey(translationKey, ["published"]);
  }

  return LOCALE_SWITCHER_META.map(({ code, flag, label }) => {
    const prefix = publicLocaleUrlPrefix(code);
    let url = publicLocaleHomeUrl(code);

    if (resolvedKind === "archive") {
      url = `${prefix}/posts`;
    } else if (
      translationKey &&
      (resolvedKind === "home" || resolvedKind === "single" || resolvedKind === "page")
    ) {
      const dbCode = adminUrlLocaleToDbCode(code);
      const match = siblings.find((row) => row.locale_code === dbCode);
      url = match ? `${prefix}/${match.slug}` : publicLocaleHomeUrl(code);
    } else if (post?.slug && code === currentLocale) {
      url = `${prefix}/${post.slug}`;
    }

    return { code, flag, label, url, active: code === currentLocale };
  });
}

export async function buildThemeRenderContext(
  locals: App.Locals,
  requestUrl: URL,
  route: ResolvedPublicRoute,
  pkg: ThemePackageRecord,
): Promise<ThemeRenderContext> {
  const baseUrl = requestUrl.origin;
  const content = createEdgepressContent(locals, { baseUrl });
  const kv = getKvFromLocals(locals);
  const settings = await getSettingsFromDb(db, {
    names: ["site_name", "site_description"],
  });

  const siteName = String(settings.site_name ?? "").trim() || "Site";
  const siteDescription = String(settings.site_description ?? "").trim();
  const locale = normalizePublicLocale(route.locale);
  const dbLocale = adminUrlLocaleToDbCode(locale);
  const localePrefix = publicLocaleUrlPrefix(locale);
  const homeUrl = publicLocaleHomeUrl(locale);
  const assetBase = `${baseUrl}/themes-assets/${pkg.manifest.slug}`;
  const homeContentKey = pkg.manifest.home_content_key ?? "hello-world";

  let post: ThemePostView | undefined;
  let posts: ThemePostView[] | undefined;
  let archive: ThemeRenderContext["archive"];
  let pagination: ThemeRenderContext["pagination"];
  let seoPost: ContentPostDetail | undefined;
  let resolvedKind = route.kind;

  if (route.kind === "home") {
    try {
      const data = await content.getItem("posts", homeContentKey, {
        status: "published",
        locale: dbLocale,
        resolve: "translation_key",
      });
      seoPost = data as ContentPostDetail;
      post = toPostView(seoPost, baseUrl);
      resolvedKind = "home";
    } catch (err) {
      if (!(err instanceof ContentNotFoundError)) throw err;
    }
  } else if (route.kind === "archive") {
    const page = route.page ?? 1;
    const limit = 10;
    const list = await content.getListWithDetails("posts", {
      page,
      limit,
      locale: dbLocale,
      filter: { post_type: route.postType ?? "post", status: "published" },
      order: "published_at",
      orderDir: "desc",
    });
    posts = list.items.map((item) => toPostView(item as ContentPostDetail, baseUrl));
    archive = {
      title: route.postType === "post" ? "Blog" : String(route.postType ?? "Arquivo"),
      type: route.postType ?? "post",
    };
    const totalPages = Math.max(1, list.totalPages);
    pagination = {
      page: list.page,
      total_pages: totalPages,
      ...(list.page > 1
        ? { prev_url: buildArchivePageUrl(requestUrl.pathname, list.page - 1) }
        : {}),
      ...(list.page < totalPages
        ? { next_url: buildArchivePageUrl(requestUrl.pathname, list.page + 1) }
        : {}),
    };
    seoPost = posts[0] as unknown as ContentPostDetail | undefined;
    resolvedKind = "archive";
  } else if (route.slug) {
    try {
      const data = await content.getBySlug(route.slug, { status: "published" });
      seoPost = data;
      post = toPostView(data, baseUrl);
      resolvedKind = post.post_type_slug === "post" ? "single" : "page";
    } catch (err) {
      if (err instanceof ContentNotFoundError || err instanceof ContentBadRequestError) {
        resolvedKind = "404";
      } else {
        throw err;
      }
    }
  }

  const menuList = await content.getListWithDetails<{
    custom_fields?: CustomFieldItem[];
  }>("posts", {
    limit: 500,
    locale: dbLocale,
    filter: { post_type: "menus", status: "published" },
  });

  const menus: Record<string, MenuItem[]> = {
    primary: menuList.items.flatMap((item) =>
      getMenuItemsFromPost(item, "menu navigation", route.path),
    ),
  };

  const canonicalUrl = new URL(route.path || "/", baseUrl).href;
  const seo = buildSeoFromPost({
    post: seoPost as Parameters<typeof buildSeoFromPost>[0]["post"],
    fallbackTitle: siteName,
    canonicalUrl,
    siteName,
    ogImage: post ? resolveOgImage(seoPost ?? ({} as ContentPostDetail), baseUrl) : undefined,
  });

  const localeSwitcher = await buildLocaleSwitcher(
    locale,
    resolvedKind,
    post,
    homeContentKey,
  );

  return {
    site: {
      title: siteName,
      description: siteDescription,
      locale,
      locale_prefix: localePrefix,
      home_url: homeUrl,
      base_url: baseUrl,
      html_lang: localeToHtmlLang(locale),
      year: new Date().getFullYear(),
    },
    seo,
    menus,
    locale_switcher: localeSwitcher,
    theme: {
      slug: pkg.manifest.slug,
      version: pkg.manifest.version,
      asset_base_url: assetBase,
    },
    route: {
      kind: resolvedKind,
      path: route.path,
      locale,
    },
    body_class: buildBodyClass({ ...route, kind: resolvedKind }, post),
    ...(post ? { post } : {}),
    ...(posts ? { posts } : {}),
    ...(archive ? { archive } : {}),
    ...(pagination ? { pagination } : {}),
  };
}

function buildArchivePageUrl(pathname: string, page: number): string {
  const url = new URL(pathname, "http://localhost");
  if (page <= 1) {
    url.searchParams.delete("page");
  } else {
    url.searchParams.set("page", String(page));
  }
  const qs = url.searchParams.toString();
  return `${url.pathname}${qs ? `?${qs}` : ""}`;
}
