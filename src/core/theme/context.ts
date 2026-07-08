import {
  ContentBadRequestError,
  ContentNotFoundError,
  createEdgepressContent,
  type ContentPostDetail,
} from "../services/edgepress-content.ts";
import { getSettingsWithCache } from "../services/settings-service.ts";
import { db } from "../../db/index.ts";
import {
  getCacheKvFromLocals,
  isAuthenticatedFromLocals,
} from "../../utils/runtime-locals.ts";
import { adminUrlLocaleToDbCode } from "../../utils/admin-locale-constants.ts";
import type {
  MenuItem,
  ResolvedPublicRoute,
  ThemePackageRecord,
  ThemePostView,
  ThemeRenderContext,
} from "./types.ts";
import { buildSeoFromPost, resolveThemeSeoContext } from "./seo-head.ts";
import { buildBodyClass } from "./body-class.ts";
import {
  localeToHtmlLang,
  normalizePublicLocale,
  publicLocaleHomeUrl,
  publicLocaleUrlPrefix,
} from "./resolve-route.ts";
import { buildLocaleSwitcher } from "./locale-switcher.ts";
import { filterPublicThemeListPosts, isPublicThemeListPost } from "./post-filters.ts";
import {
  resolveCoverImage,
  type CoverImageAttachmentCache,
} from "./cover-image.ts";
import { createGetTaxonomiesHandler, createGetRelatedPostsHandler, createGetTaxonomyPostsHandler, createGetPostsHandler, createGetAuthorHandler, createGetTaxonomiesLocaleHandler } from "./theme-functions.ts";
import { getPublicTaxonomyTerm } from "./taxonomy-routes.ts";
import {
  getLocalizedTaxonomyTerm,
  getLocalizedTaxonomyType,
  resolveTaxonomySlugForFilter,
} from "../services/taxonomy-translation-service.ts";
import type { ThemeRouteKind } from "./types.ts";
import type { EdgepressContent } from "../services/edgepress-content.ts";
import { loadPublishedMenusByLocation, type MenuItemPublicRaw } from "../services/menu-items-service.ts";
import {
  buildMenuCacheKey,
  getMenusFromCache,
  putMenusCache,
} from "../../utils/menu-cache.ts";
import { buildMediaUrl, type MediaSize } from "../../utils/media-urls.ts";
import { searchPosts } from "../services/search-service.ts";
import { resolveLocaleId } from "../services/post-translation-service.ts";
import { buildContentPostPayload } from "../../utils/content-post-payload.ts";
import { inArray } from "drizzle-orm";
import { injectCategoryMeta } from "./post-category-meta.ts";
import { injectCustomFieldsMeta } from "./custom-fields-meta.ts";
import { posts as postsTable } from "../../db/schema.ts";

async function loadMenusWithCache(
  cacheKv: ReturnType<typeof getCacheKvFromLocals>,
  dbLocale: string,
): Promise<Record<string, MenuItemPublicRaw[]>> {
  const key = buildMenuCacheKey(dbLocale);
  const cached = await getMenusFromCache(cacheKv, key);
  if (cached) return cached;
  const menus = await loadPublishedMenusByLocation(db, dbLocale);
  await putMenusCache(cacheKv, key, menus);
  return menus;
}

function routeContextFields(
  route: ResolvedPublicRoute,
  kind?: ThemeRouteKind,
  taxonomy?: { type: string; slug: string },
) {
  return {
    kind: kind ?? route.kind,
    path: route.path,
    locale: route.locale,
    template_key: route.templateKey,
    params: route.params,
    ...(taxonomy
      ? { taxonomy_type: taxonomy.type, taxonomy_slug: taxonomy.slug }
      : route.taxonomyType
        ? { taxonomy_type: route.taxonomyType, taxonomy_slug: route.taxonomySlug }
        : {}),
  };
}

function mapMenuItemWithActive(
  item: MenuItemPublicRaw,
  normPath: string,
): MenuItem {
  const urlNorm = item.url.replace(/\/+$/, "") || "/";
  return {
    id: item.id,
    label: item.label,
    url: item.url,
    slug: item.slug,
    target_post_id: item.target_post_id,
    active: item.url !== "" && normPath === urlNorm,
    submenu_sort: item.submenu_sort,
    submenu_display: item.submenu_display,
    children: (item.children ?? []).map((child) => mapMenuItemWithActive(child, normPath)),
  };
}

function buildThemeMenusRecord(
  menusByLocation: Record<string, MenuItemPublicRaw[]>,
  currentPath: string,
): Record<string, MenuItem[]> {
  const normPath = currentPath.replace(/\/+$/, "") || "/";
  const menus: Record<string, MenuItem[]> = {};
  for (const [location, items] of Object.entries(menusByLocation)) {
    menus[location] = items.map((item) => mapMenuItemWithActive(item, normPath));
  }
  return menus;
}

function toPostView(post: ContentPostDetail): ThemePostView {
  const metaValues = (post.meta_values ?? {}) as Record<string, unknown>;
  const meta: Record<string, string> = {};
  for (const [k, v] of Object.entries(metaValues)) {
    if (v != null) meta[k] = String(v);
  }

  const taxonomies = post.taxonomies as
    | Array<{ type?: string; slug?: string; name?: string }>
    | undefined;
  injectCategoryMeta(meta, taxonomies);

  const customFields = Array.isArray(post.custom_fields) ? post.custom_fields : [];
  injectCustomFieldsMeta(meta, customFields);

  return {
    id: Number(post.id),
    title: String(post.title ?? ""),
    slug: String(post.slug ?? ""),
    excerpt: String(post.excerpt ?? ""),
    body_html: String(post.body ?? ""),
    body_blocks: post.body_blocks ?? null,
    author_name: String((post as { author_name?: string }).author_name ?? ""),
    published_at:
      typeof post.published_at === "number"
        ? post.published_at
        : post.published_at
          ? Date.parse(String(post.published_at))
          : null,
    post_type_slug: String(post["post_type_slug"] ?? "post"),
    meta,
    custom_fields: customFields,
  };
}

async function enrichPostViewWithCover(
  view: ThemePostView,
  source: ContentPostDetail,
  baseUrl: string,
  cache: CoverImageAttachmentCache,
  kv?: ReturnType<typeof getCacheKvFromLocals>,
  size: MediaSize = "medium",
): Promise<ThemePostView> {
  const cover = await resolveCoverImage(source, baseUrl, db, cache, kv, size);
  return cover ? { ...view, cover_image: cover } : view;
}

function buildGetRelatedPostsHandler(
  content: EdgepressContent,
  dbLocale: string,
  baseUrl: string,
  cacheKv: ReturnType<typeof getCacheKvFromLocals>,
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
        enrichPostViewWithCover(toPostView(item), item, baseUrl, attachmentCache, cacheKv),
      ),
    );
  });
}

function buildLocalizedGetTaxonomiesHandler(
  content: EdgepressContent,
  database: typeof db,
  dbLocale: string,
  cacheKv: ReturnType<typeof getCacheKvFromLocals>,
) {
  const taxonomyCache = { kv: cacheKv };
  return createGetTaxonomiesHandler(async (postType, taxonomyType) => {
    const res = await content.getTaxonomies(postType, taxonomyType);
    return Promise.all(
      res.items.map(async (item) => {
        const term = {
          id: Number(item.id ?? 0),
          name: String(item.name ?? ""),
          slug: String(item.slug ?? ""),
          type: taxonomyType,
        };
        const localized = await getLocalizedTaxonomyTerm(database, term, dbLocale, taxonomyCache);
        return { ...item, name: localized.name, slug: localized.slug };
      }),
    );
  });
}

function buildGetTaxonomiesLocaleHandler(
  content: EdgepressContent,
  database: typeof db,
  cacheKv: ReturnType<typeof getCacheKvFromLocals>,
) {
  const taxonomyCache = { kv: cacheKv };
  return createGetTaxonomiesLocaleHandler(async (postType, taxonomyType, locale) => {
    const dbLocale = adminUrlLocaleToDbCode(locale);
    const [res, taxonomy] = await Promise.all([
      content.getTaxonomies(postType, taxonomyType),
      getLocalizedTaxonomyType(database, taxonomyType, dbLocale, taxonomyCache),
    ]);
    const values = await Promise.all(
      res.items.map(async (item) => {
        const term = {
          id: Number(item.id ?? 0),
          name: String(item.name ?? ""),
          slug: String(item.slug ?? ""),
          type: taxonomyType,
        };
        const localized = await getLocalizedTaxonomyTerm(database, term, dbLocale, taxonomyCache);
        return { id: term.id, name: localized.name, slug: localized.slug, locale };
      }),
    );
    return { taxonomy, values };
  });
}

function buildGetTaxonomyPostsHandler(
  content: EdgepressContent,
  dbLocale: string,
  baseUrl: string,
  database: typeof db,
  cacheKv: ReturnType<typeof getCacheKvFromLocals>,
) {
  const taxonomyCache = { kv: cacheKv };
  return createGetTaxonomyPostsHandler(async (taxonomyType, taxonomySlug, limit) => {
    const canonicalSlug = await resolveTaxonomySlugForFilter(
      database,
      taxonomyType,
      taxonomySlug,
      dbLocale,
      taxonomyCache,
    );
    if (!canonicalSlug) return [];

    const listResult = await content.getList("posts", {
      limit,
      locale: dbLocale,
      filter: { status: "published" },
      filter_taxonomy_slug: canonicalSlug,
      filter_taxonomy_type: taxonomyType,
      order: "order",
      orderDir: "desc",
      include: "custom_fields",
    });
    const filtered = filterPublicThemeListPosts(listResult.items) as ContentPostDetail[];
    const attachmentCache: CoverImageAttachmentCache = new Map();
    return Promise.all(
      filtered.map(async (item) =>
        enrichPostViewWithCover(toPostView(item), item, baseUrl, attachmentCache, cacheKv),
      ),
    );
  });
}

function buildGetPostsListHandler(
  content: EdgepressContent,
  dbLocale: string,
  baseUrl: string,
  includeCustomFields: boolean,
  cacheKv: ReturnType<typeof getCacheKvFromLocals>,
) {
  return createGetPostsHandler(async (postTypeSlug, limit) => {
    const listResult = await content.getList("posts", {
      limit,
      locale: dbLocale,
      filter: { status: "published", post_type: postTypeSlug },
      order: "order",
      orderDir: "desc",
      ...(includeCustomFields ? { include: "custom_fields" } : {}),
    });
    const filtered = filterPublicThemeListPosts(listResult.items) as ContentPostDetail[];
    const attachmentCache: CoverImageAttachmentCache = new Map();
    return Promise.all(
      filtered.map(async (item) =>
        enrichPostViewWithCover(toPostView(item), item, baseUrl, attachmentCache, cacheKv),
      ),
    );
  });
}

function buildGetPostsHandler(
  content: EdgepressContent,
  dbLocale: string,
  baseUrl: string,
  cacheKv: ReturnType<typeof getCacheKvFromLocals>,
) {
  return buildGetPostsListHandler(content, dbLocale, baseUrl, false, cacheKv);
}

function buildGetPostsDetailsHandler(
  content: EdgepressContent,
  dbLocale: string,
  baseUrl: string,
  cacheKv: ReturnType<typeof getCacheKvFromLocals>,
) {
  return buildGetPostsListHandler(content, dbLocale, baseUrl, true, cacheKv);
}

function buildGetAuthorHandler(content: EdgepressContent, dbLocale: string) {
  return createGetAuthorHandler(async (idOrSlug) =>
    content.getAuthorForPost(idOrSlug, { locale: dbLocale, status: "published" }),
  );
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

function buildSearchPageUrl(pathname: string, q: string, page: number, postType?: string): string {
  const url = new URL(pathname, "http://localhost");
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  if (postType) url.searchParams.set("post_type", postType);
  else url.searchParams.delete("post_type");
  if (page <= 1) url.searchParams.delete("page");
  else url.searchParams.set("page", String(page));
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
  const settings = await getSettingsWithCache(db, {
    namesParam: "site_name,site_description",
    kv: getCacheKvFromLocals(locals),
    isAuthenticated: isAuthenticatedFromLocals(locals),
  });

  const siteName = String(settings["site_name"] ?? "").trim() || "Site";
  const siteDescription = String(settings["site_description"] ?? "").trim();
  const locale = normalizePublicLocale(route.locale);
  const dbLocale = adminUrlLocaleToDbCode(locale);
  const localePrefix = publicLocaleUrlPrefix(locale);
  const homeUrl = publicLocaleHomeUrl(locale);
  const assetBase = `${baseUrl}/themes-assets/${pkg.manifest.slug}`;
  const themeSupports = pkg.manifest.supports ?? [];
  const homeContentKey = pkg.manifest.home_content_key ?? "hello-world";
  const homeListPosts = pkg.manifest.home_list_posts === true;

  const cacheKv = getCacheKvFromLocals(locals);
  const menusPromise = loadMenusWithCache(cacheKv, dbLocale);

  if (route.kind === "taxonomy" && route.taxonomyType && route.taxonomySlug) {
    const listPage = route.page ?? 1;
    const taxonomyCache = { kv: cacheKv };
    const term = await getPublicTaxonomyTerm(
      db,
      route.taxonomyType,
      route.taxonomySlug,
      dbLocale,
      taxonomyCache,
    );
    const localized = term
      ? await getLocalizedTaxonomyTerm(db, term, dbLocale, taxonomyCache)
      : null;
    const canonicalSlug = term?.slug;

    const [menusByLocation, listResult] = await Promise.all([
      menusPromise,
      term && canonicalSlug
        ? content.getListWithDetails("posts", {
            page: listPage,
            limit: 10,
            locale: dbLocale,
            filter: { status: "published" },
            filter_taxonomy_slug: canonicalSlug,
            filter_taxonomy_type: route.taxonomyType,
            order: "published_at",
            orderDir: "desc",
          })
        : Promise.resolve({
            items: [] as ContentPostDetail[],
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 1,
          }),
    ]);

    const attachmentCache: CoverImageAttachmentCache = new Map();
    const resolvedKind: ThemeRouteKind = term ? "taxonomy" : "404";
    const taxonomyMeta = term && localized
      ? { type: route.taxonomyType, slug: localized.slug }
      : undefined;

    const filteredListPosts = term
      ? (filterPublicThemeListPosts(listResult.items) as ContentPostDetail[])
      : [];
    const posts = await Promise.all(
      filteredListPosts.map(async (item) =>
        enrichPostViewWithCover(toPostView(item), item, baseUrl, attachmentCache, cacheKv),
      ),
    );

    const archive = {
      title: localized?.name ?? route.taxonomySlug,
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
    const menus = buildThemeMenusRecord(menusByLocation, route.path);
    const canonicalUrl = new URL(route.path || "/", baseUrl).href;
    const seo = resolveThemeSeoContext({
      resolvedKind,
      isArchiveRoute: is_archive,
      archiveTitle: archive.title,
      homeListPosts,
      siteName,
      siteDescription,
      canonicalUrl,
      ...(is_archive && posts[0]?.cover_image
        ? { ogImage: buildMediaUrl(posts[0].cover_image, "large") }
        : {}),
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
      locale_switcher: await buildLocaleSwitcher(locale, route, resolvedKind, {
        taxonomyCanonicalSlug: term?.slug,
        db,
        kv: cacheKv,
      }),
      theme: {
        slug: pkg.manifest.slug,
        version: pkg.manifest.version,
        asset_base_url: assetBase,
        supports: themeSupports,
      },
      route: routeContextFields(route, resolvedKind, taxonomyMeta),
      body_class: buildBodyClass(route, undefined, resolvedKind, taxonomyMeta),
      posts,
      archive,
      pagination,
      is_front_page: false,
      is_single: false,
      is_page: false,
      is_singular: false,
      is_archive,
      is_search: false,
      is_404: resolvedKind === "404",
      have_posts: posts.length > 0,
      get_taxonomies: buildLocalizedGetTaxonomiesHandler(content, db, dbLocale, cacheKv),
      get_taxonomies_locale: buildGetTaxonomiesLocaleHandler(content, db, cacheKv),
      get_related_posts: buildGetRelatedPostsHandler(content, dbLocale, baseUrl, cacheKv),
      get_taxonomy_posts: buildGetTaxonomyPostsHandler(content, dbLocale, baseUrl, db, cacheKv),
      get_posts: buildGetPostsHandler(content, dbLocale, baseUrl, cacheKv),
      get_posts_details: buildGetPostsDetailsHandler(content, dbLocale, baseUrl, cacheKv),
      get_author: buildGetAuthorHandler(content, dbLocale),
    };
  }

  if (route.kind === "search") {
    const q = route.searchQuery ?? "";
    const page = route.page ?? 1;
    const postTypeFilter = requestUrl.searchParams.get("post_type")?.trim() || undefined;
    const localeId = await resolveLocaleId(dbLocale, db, { kv: cacheKv });
    const searchLimit = 20;

    const [menusByLocation, searchResult] = await Promise.all([
      menusPromise,
      localeId != null
        ? searchPosts(db, {
            q,
            localeId,
            page,
            limit: searchLimit,
            ...(postTypeFilter ? { post_type: postTypeFilter } : {}),
          })
        : Promise.resolve(null),
    ]);

    const attachmentCache: CoverImageAttachmentCache = new Map();
    const hits = searchResult?.hits ?? [];
    const total = searchResult?.total ?? 0;
    const totalPages = Math.max(0, searchResult?.totalPages ?? 0);
    const currentPage = searchResult?.page ?? page;

    let posts: ThemePostView[] = [];
    if (hits.length > 0) {
      const postIds = hits.map((hit) => hit.post_id);
      const postRows = await db
        .select({
          id: postsTable.id,
          post_type_id: postsTable.post_type_id,
          parent_id: postsTable.parent_id,
          author_id: postsTable.author_id,
          title: postsTable.title,
          slug: postsTable.slug,
          excerpt: postsTable.excerpt,
          body: postsTable.body,
          body_blocks: postsTable.body_blocks,
          status: postsTable.status,
          meta_values: postsTable.meta_values,
          published_at: postsTable.published_at,
          created_at: postsTable.created_at,
          updated_at: postsTable.updated_at,
        })
        .from(postsTable)
        .where(inArray(postsTable.id, postIds));

      const postById = new Map(postRows.map((row) => [row.id, row]));
      posts = (
        await Promise.all(
          postIds.map(async (postId) => {
            const row = postById.get(postId);
            if (!row) return null;
            const payload = await buildContentPostPayload(
              db,
              { ...row, status: row.status ?? "published" },
              { baseUrl },
            );
            const detail = payload as unknown as ContentPostDetail;
            if (
              !isPublicThemeListPost({
                status: String(detail.status ?? "published"),
                post_type_slug: String(detail["post_type_slug"] ?? detail["post_types_slug"] ?? "post"),
                meta_values: (detail.meta_values ?? {}) as Record<string, unknown>,
              })
            ) {
              return null;
            }
            return enrichPostViewWithCover(toPostView(detail), detail, baseUrl, attachmentCache, cacheKv);
          }),
        )
      ).filter((item): item is ThemePostView => item != null);
    }

    const archiveTitle = q ? `Busca: ${q}` : "Busca";
    const paginationPath = route.path;
    const pagination = {
      page: currentPage,
      total_pages: Math.max(1, totalPages || 1),
      ...(currentPage > 1 && totalPages > 0
        ? {
            prev_url: buildSearchPageUrl(
              paginationPath,
              q,
              currentPage - 1,
              postTypeFilter,
            ),
          }
        : {}),
      ...(currentPage < totalPages
        ? {
            next_url: buildSearchPageUrl(
              paginationPath,
              q,
              currentPage + 1,
              postTypeFilter,
            ),
          }
        : {}),
    };

    const menus = buildThemeMenusRecord(menusByLocation, route.path);
    const canonicalUrl = buildSearchPageUrl(route.path, q, currentPage, postTypeFilter);
    const canonicalFull = new URL(canonicalUrl, baseUrl).href;
    const seo = resolveThemeSeoContext({
      resolvedKind: "search",
      isArchiveRoute: true,
      archiveTitle,
      homeListPosts,
      siteName,
      siteDescription,
      canonicalUrl: canonicalFull,
      ...(posts[0]?.cover_image
        ? { ogImage: buildMediaUrl(posts[0].cover_image, "large") }
        : {}),
    });

    const searchLocaleSwitcher = await buildLocaleSwitcher(locale, route, "search");

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
      locale_switcher: searchLocaleSwitcher,
      theme: {
        slug: pkg.manifest.slug,
        version: pkg.manifest.version,
        asset_base_url: assetBase,
        supports: themeSupports,
      },
      route: routeContextFields(route, "search"),
      body_class: buildBodyClass(route, undefined, "search"),
      posts,
      archive: { title: archiveTitle, type: "search" },
      pagination,
      search: { query: q, total },
      is_front_page: false,
      is_single: false,
      is_page: false,
      is_singular: false,
      is_archive: false,
      is_search: true,
      is_404: false,
      have_posts: posts.length > 0,
      get_taxonomies: buildLocalizedGetTaxonomiesHandler(content, db, dbLocale, cacheKv),
      get_taxonomies_locale: buildGetTaxonomiesLocaleHandler(content, db, cacheKv),
      get_related_posts: buildGetRelatedPostsHandler(content, dbLocale, baseUrl, cacheKv),
      get_taxonomy_posts: buildGetTaxonomyPostsHandler(content, dbLocale, baseUrl, db, cacheKv),
      get_posts: buildGetPostsHandler(content, dbLocale, baseUrl, cacheKv),
      get_posts_details: buildGetPostsDetailsHandler(content, dbLocale, baseUrl, cacheKv),
      get_author: buildGetAuthorHandler(content, dbLocale),
    };
  }

  const resolvedKind = route.kind;
  const isArchiveRoute = resolvedKind === "archive";
  const listPostType = route.postType ?? "post";
  const listPage = isArchiveRoute ? (route.page ?? 1) : 1;
  const listLimit = isArchiveRoute ? 10 : 20;

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

  const [listResult, slugPostData, homePostData, menusByLocation] = await Promise.all([
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
    menusPromise,
  ]);

  const attachmentCache: CoverImageAttachmentCache = new Map();
  const filteredListPosts = filterPublicThemeListPosts(
    listResult.items,
  ) as ContentPostDetail[];

  const posts = await Promise.all(
    filteredListPosts.map(async (item) =>
      enrichPostViewWithCover(toPostView(item), item, baseUrl, attachmentCache, cacheKv),
    ),
  );

  let post: ThemePostView | undefined;
  let seoPost: ContentPostDetail | undefined;
  let finalKind = resolvedKind;

  if (isArchiveRoute) {
    finalKind = "archive";
  } else if (slugPostData) {
    seoPost = slugPostData;
    post = await enrichPostViewWithCover(
      toPostView(slugPostData),
      slugPostData,
      baseUrl,
      attachmentCache,
      cacheKv,
      "large",
    );
    finalKind = post.post_type_slug === "post" ? "single" : "page";
  } else if (route.slug && resolvedKind !== "404") {
    finalKind = "404";
  } else if (route.kind === "home" && !homeListPosts && homePostData) {
    seoPost = homePostData as ContentPostDetail;
    post = await enrichPostViewWithCover(
      toPostView(seoPost),
      seoPost,
      baseUrl,
      attachmentCache,
      cacheKv,
      "large",
    );
    finalKind = "home";
  } else if (route.kind === "home") {
    finalKind = "home";
  } else if (resolvedKind === "404") {
    finalKind = "404";
  }

  const archiveTitle =
    isArchiveRoute && listPostType === "post"
      ? "Blog"
      : isArchiveRoute
        ? listPostType
        : listPostType === "post"
          ? "Blog"
          : String(listPostType);

  const archive = {
    title: archiveTitle,
    type: listPostType,
  };

  const totalPages = Math.max(1, listResult.totalPages);
  const paginationPath =
    finalKind === "archive" || finalKind === "taxonomy"
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

  const is_front_page = finalKind === "home";
  const is_single = finalKind === "single";
  const is_page = finalKind === "page";
  const is_singular = is_single || is_page;
  const is_archive = finalKind === "archive" || finalKind === "taxonomy";
  const is_404 = finalKind === "404";
  const have_posts = posts.length > 0;

  const menus = buildThemeMenusRecord(menusByLocation, route.path);

  const canonicalUrl = new URL(route.path || "/", baseUrl).href;
  const seoOgImage = seoPost
    ? await resolveCoverImage(seoPost, baseUrl, db, attachmentCache, cacheKv, "large")
    : finalKind === "home" && homeListPosts && posts[0]
      ? buildMediaUrl(posts[0].cover_image, "large")
      : undefined;
  const seo = resolveThemeSeoContext({
    resolvedKind: finalKind,
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

  const localeSwitcher = await buildLocaleSwitcher(locale, route, finalKind, {
    archivePostType: isArchiveRoute ? archive.type : undefined,
    kv: cacheKv,
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
    locale_switcher: localeSwitcher,
    theme: {
      slug: pkg.manifest.slug,
      version: pkg.manifest.version,
      asset_base_url: assetBase,
      supports: themeSupports,
    },
    route: routeContextFields(route, finalKind),
    body_class: buildBodyClass({ ...route, kind: finalKind }, post, finalKind),
    ...(post ? { post } : {}),
    posts,
    archive,
    pagination,
    is_front_page,
    is_single,
    is_page,
    is_singular,
    is_archive,
    is_search: false,
    is_404,
    have_posts,
    get_taxonomies: buildLocalizedGetTaxonomiesHandler(content, db, dbLocale, cacheKv),
    get_taxonomies_locale: buildGetTaxonomiesLocaleHandler(content, db, cacheKv),
    get_related_posts: buildGetRelatedPostsHandler(content, dbLocale, baseUrl, cacheKv),
    get_taxonomy_posts: buildGetTaxonomyPostsHandler(content, dbLocale, baseUrl, db, cacheKv),
    get_posts: buildGetPostsHandler(content, dbLocale, baseUrl, cacheKv),
    get_posts_details: buildGetPostsDetailsHandler(content, dbLocale, baseUrl, cacheKv),
    get_author: buildGetAuthorHandler(content, dbLocale),
  };
}
