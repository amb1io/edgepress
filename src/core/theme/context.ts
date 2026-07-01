import {
  ContentBadRequestError,
  ContentNotFoundError,
  createEdgepressContent,
  type ContentPostDetail,
} from "../services/edgepress-content.ts";
import { getSettingsFromDb } from "../services/settings-service.ts";
import { db } from "../../db/index.ts";
import { getKvFromLocals } from "../../utils/runtime-locals.ts";
import { adminUrlLocaleToDbCode } from "../../utils/admin-locale-constants.ts";
import type {
  MenuItem,
  ResolvedPublicRoute,
  ThemePackageRecord,
  ThemePostView,
  ThemeRenderContext,
} from "./types.ts";
import { buildSeoFromPost, resolveThemeSeoContext } from "./seo-head.ts";
import {
  localeToHtmlLang,
  normalizePublicLocale,
  publicLocaleHomeUrl,
  publicLocaleUrlPrefix,
} from "./resolve-route.ts";
import { getArchivablePostTypes, resolveArchivePostTypeFromRoute } from "./post-type-routes.ts";
import { buildLocaleSwitcher } from "./locale-switcher.ts";
import { filterPublicThemeListPosts } from "./post-filters.ts";
import {
  resolveCoverImage,
  type CoverImageAttachmentCache,
} from "./cover-image.ts";
import { createGetTaxonomiesHandler, createGetRelatedPostsHandler, createGetAuthorHandler } from "./theme-functions.ts";
import { getPublicTaxonomyTerm } from "./taxonomy-routes.ts";
import type { ThemeRouteKind } from "./types.ts";
import type { EdgepressContent } from "../services/edgepress-content.ts";

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

function toPostView(post: ContentPostDetail): ThemePostView {
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
    post_type_slug: String(post["post_type_slug"] ?? "post"),
    meta,
  };
}

async function enrichPostViewWithCover(
  view: ThemePostView,
  source: ContentPostDetail,
  baseUrl: string,
  cache: CoverImageAttachmentCache,
): Promise<ThemePostView> {
  const cover = await resolveCoverImage(source, baseUrl, db, cache);
  return cover ? { ...view, cover_image: cover } : view;
}

function buildGetRelatedPostsHandler(
  content: EdgepressContent,
  dbLocale: string,
  baseUrl: string,
) {
  return createGetRelatedPostsHandler(async (idOrSlug, limit) => {
    const rows = filterPublicThemeListPosts(
      await content.getRelatedPosts(idOrSlug, {
        limit,
        locale: dbLocale,
        status: "published",
      }),
    );
    const attachmentCache: CoverImageAttachmentCache = new Map();
    return Promise.all(
      rows.map(async (item) =>
        enrichPostViewWithCover(toPostView(item), item, baseUrl, attachmentCache),
      ),
    );
  });
}

function buildGetAuthorHandler(content: EdgepressContent, dbLocale: string) {
  return createGetAuthorHandler(async (idOrSlug) =>
    content.getAuthorForPost(idOrSlug, { locale: dbLocale, status: "published" }),
  );
}

function buildBodyClass(
  route: ResolvedPublicRoute,
  post?: ThemePostView,
  resolvedKind?: ThemeRouteKind,
  taxonomy?: { type: string; slug: string },
): string {
  const kind = resolvedKind ?? route.kind;
  const parts = [`route-${kind}`, `locale-${route.locale.replace(/-/g, "_")}`];
  if (taxonomy?.type) parts.push(`taxonomy-${taxonomy.type}`);
  if (taxonomy?.slug) parts.push(`term-${taxonomy.slug.replace(/\//g, "-")}`);
  if (post?.post_type_slug) parts.push(`type-${post.post_type_slug}`);
  if (post?.slug) parts.push(`slug-${post.slug.replace(/\//g, "-")}`);
  return parts.join(" ");
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

  const siteName = String(settings["site_name"] ?? "").trim() || "Site";
  const siteDescription = String(settings["site_description"] ?? "").trim();
  const locale = normalizePublicLocale(route.locale);
  const dbLocale = adminUrlLocaleToDbCode(locale);
  const localePrefix = publicLocaleUrlPrefix(locale);
  const homeUrl = publicLocaleHomeUrl(locale);
  const assetBase = `${baseUrl}/themes-assets/${pkg.manifest.slug}`;
  const homeContentKey = pkg.manifest.home_content_key ?? "hello-world";
  const homeListPosts = pkg.manifest.home_list_posts === true;

  const menuListPromise = content.getListWithDetails("posts", {
    limit: 500,
    locale: dbLocale,
    filter: { post_type: "menus", status: "published" },
  });

  if (route.kind === "taxonomy" && route.taxonomyType && route.taxonomySlug) {
    const listPage = route.page ?? 1;
    const [term, menuList, listResult] = await Promise.all([
      getPublicTaxonomyTerm(db, route.taxonomyType, route.taxonomySlug),
      menuListPromise,
      content.getListWithDetails("posts", {
        page: listPage,
        limit: 10,
        locale: dbLocale,
        filter: { status: "published" },
        filter_taxonomy_slug: route.taxonomySlug,
        filter_taxonomy_type: route.taxonomyType,
        order: "published_at",
        orderDir: "desc",
      }),
    ]);

    const attachmentCache: CoverImageAttachmentCache = new Map();
    const resolvedKind: ThemeRouteKind = term ? "taxonomy" : "404";
    const taxonomyMeta = term
      ? { type: route.taxonomyType, slug: route.taxonomySlug }
      : undefined;

    const filteredListPosts = term
      ? (filterPublicThemeListPosts(listResult.items) as ContentPostDetail[])
      : [];
    const posts = await Promise.all(
      filteredListPosts.map(async (item) =>
        enrichPostViewWithCover(toPostView(item), item, baseUrl, attachmentCache),
      ),
    );

    const archive = {
      title: term?.name ?? route.taxonomySlug,
      type: route.taxonomyType,
    };
    const totalPages = term ? Math.max(1, listResult.totalPages) : 1;
    const paginationPath = route.path;
    const pagination = {
      page: term ? listResult.page : 1,
      total_pages: totalPages,
      ...(term && listResult.page > 1
        ? { prev_url: buildArchivePageUrl(paginationPath, listResult.page - 1) }
        : {}),
      ...(term && listResult.page < totalPages
        ? { next_url: buildArchivePageUrl(paginationPath, listResult.page + 1) }
        : {}),
    };

    const is_archive = resolvedKind === "taxonomy";
    const menus: Record<string, MenuItem[]> = {
      primary: menuList.items.flatMap((item) =>
        getMenuItemsFromPost(item as { custom_fields?: CustomFieldItem[] }, "menu navigation", route.path),
      ),
    };
    const canonicalUrl = new URL(route.path || "/", baseUrl).href;
    const seo = resolveThemeSeoContext({
      resolvedKind,
      isArchiveRoute: is_archive,
      archiveTitle: archive.title,
      homeListPosts,
      siteName,
      siteDescription,
      canonicalUrl,
      ...(is_archive && posts[0]?.cover_image ? { ogImage: posts[0].cover_image } : {}),
    });

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
      locale_switcher: buildLocaleSwitcher(locale, route, resolvedKind),
      theme: {
        slug: pkg.manifest.slug,
        version: pkg.manifest.version,
        asset_base_url: assetBase,
      },
      route: {
        kind: resolvedKind,
        path: route.path,
        locale,
        ...(taxonomyMeta
          ? { taxonomy_type: taxonomyMeta.type, taxonomy_slug: taxonomyMeta.slug }
          : {}),
      },
      body_class: buildBodyClass(route, undefined, resolvedKind, taxonomyMeta),
      posts,
      archive,
      pagination,
      is_front_page: false,
      is_single: false,
      is_page: false,
      is_singular: false,
      is_archive,
      is_404: resolvedKind === "404",
      have_posts: posts.length > 0,
      get_taxonomies: createGetTaxonomiesHandler(async (postType, taxonomyType) => {
        const res = await content.getTaxonomies(postType, taxonomyType);
        return res.items;
      }),
      get_related_posts: buildGetRelatedPostsHandler(content, dbLocale, baseUrl),
      get_author: buildGetAuthorHandler(content, dbLocale),
    };
  }

  const archivablePostTypes = await getArchivablePostTypes(db, kv);
  const archiveRoute = resolveArchivePostTypeFromRoute(route, archivablePostTypes);
  const isArchiveRoute = archiveRoute != null;

  const listPage = isArchiveRoute ? (route.page ?? 1) : 1;
  const listLimit = isArchiveRoute ? 10 : 20;
  const listPostType = isArchiveRoute ? archiveRoute.postType : "post";

  const fetchSlugPost =
    route.slug && !isArchiveRoute
      ? content
          .getBySlug(route.slug, { status: "published" })
          .catch((err: unknown) => {
            if (err instanceof ContentNotFoundError || err instanceof ContentBadRequestError) {
              return null;
            }
            throw err;
          })
      : Promise.resolve(null);

  const fetchHomePost =
    route.kind === "home" && !homeListPosts
      ? content
          .getItem("posts", homeContentKey, {
            status: "published",
            locale: dbLocale,
            resolve: "translation_key",
          })
          .catch((err: unknown) => {
            if (err instanceof ContentNotFoundError) return null;
            throw err;
          })
      : Promise.resolve(null);

  const [listResult, slugPostData, homePostData, menuList] = await Promise.all([
    content.getListWithDetails("posts", {
      page: listPage,
      limit: listLimit,
      locale: dbLocale,
      filter: { post_type: listPostType, status: "published" },
      order: "published_at",
      orderDir: "desc",
    }),
    fetchSlugPost,
    fetchHomePost,
    menuListPromise,
  ]);

  const attachmentCache: CoverImageAttachmentCache = new Map();
  const filteredListPosts = filterPublicThemeListPosts(
    listResult.items,
  ) as ContentPostDetail[];

  const posts = await Promise.all(
    filteredListPosts.map(async (item) =>
      enrichPostViewWithCover(toPostView(item), item, baseUrl, attachmentCache),
    ),
  );

  let post: ThemePostView | undefined;
  let seoPost: ContentPostDetail | undefined;
  let resolvedKind = route.kind;

  if (isArchiveRoute) {
    resolvedKind = "archive";
  } else if (slugPostData) {
    seoPost = slugPostData;
    post = await enrichPostViewWithCover(
      toPostView(slugPostData),
      slugPostData,
      baseUrl,
      attachmentCache,
    );
    resolvedKind = post.post_type_slug === "post" ? "single" : "page";
  } else if (route.slug) {
    resolvedKind = "404";
  } else if (route.kind === "home" && !homeListPosts && homePostData) {
    seoPost = homePostData as ContentPostDetail;
    post = await enrichPostViewWithCover(
      toPostView(seoPost),
      seoPost,
      baseUrl,
      attachmentCache,
    );
    resolvedKind = "home";
  } else if (route.kind === "home") {
    resolvedKind = "home";
  }

  const archive = {
    title: isArchiveRoute
      ? archiveRoute.title
      : listPostType === "post"
        ? "Blog"
        : String(listPostType),
    type: listPostType,
  };

  const totalPages = Math.max(1, listResult.totalPages);
  const paginationPath =
    resolvedKind === "archive" || resolvedKind === "taxonomy"
      ? route.path
      : `${localePrefix}/posts`;
  const pagination = {
    page: listResult.page,
    total_pages: totalPages,
    ...(listResult.page > 1
      ? { prev_url: buildArchivePageUrl(paginationPath, listResult.page - 1) }
      : {}),
    ...(listResult.page < totalPages
      ? { next_url: buildArchivePageUrl(paginationPath, listResult.page + 1) }
      : {}),
  };

  const is_front_page = resolvedKind === "home";
  const is_single = resolvedKind === "single";
  const is_page = resolvedKind === "page";
  const is_singular = is_single || is_page;
  const is_archive = resolvedKind === "archive" || resolvedKind === "taxonomy";
  const is_404 = resolvedKind === "404";
  const have_posts = posts.length > 0;

  const menus: Record<string, MenuItem[]> = {
    primary: menuList.items.flatMap((item) =>
      getMenuItemsFromPost(item as { custom_fields?: CustomFieldItem[] }, "menu navigation", route.path),
    ),
  };

  const canonicalUrl = new URL(route.path || "/", baseUrl).href;
  const seoOgImage = seoPost
    ? await resolveCoverImage(seoPost, baseUrl, db, attachmentCache)
    : resolvedKind === "home" && homeListPosts && posts[0]
      ? posts[0].cover_image
      : undefined;
  const seo = resolveThemeSeoContext({
    resolvedKind,
    isArchiveRoute,
    archiveTitle: archive.title,
    homeListPosts,
    ...(seoPost
      ? { seoPost: seoPost as Parameters<typeof buildSeoFromPost>[0]["post"] }
      : {}),
    siteName,
    siteDescription,
    canonicalUrl,
    ...(seoOgImage ? { ogImage: seoOgImage } : {}),
  });

  const localeSwitcher = buildLocaleSwitcher(
    locale,
    route,
    resolvedKind,
    isArchiveRoute ? archive.type : undefined,
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
    body_class: buildBodyClass({ ...route, kind: resolvedKind }, post, resolvedKind),
    ...(post ? { post } : {}),
    posts,
    archive,
    pagination,
    is_front_page,
    is_single,
    is_page,
    is_singular,
    is_archive,
    is_404,
    have_posts,
    get_taxonomies: createGetTaxonomiesHandler(async (postType, taxonomyType) => {
      const res = await content.getTaxonomies(postType, taxonomyType);
      return res.items;
    }),
    get_related_posts: buildGetRelatedPostsHandler(content, dbLocale, baseUrl),
    get_author: buildGetAuthorHandler(content, dbLocale),
  };
}
