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
import { filterPublicThemeListPosts, isPublicThemeListPost } from "./post-filters.ts";
import {
  resolveCoverImage,
  type CoverImageAttachmentCache,
} from "./cover-image.ts";
import { createGetTaxonomiesHandler, createGetRelatedPostsHandler, createGetAuthorHandler } from "./theme-functions.ts";
import { getPublicTaxonomyTerm } from "./taxonomy-routes.ts";
import type { ThemeRouteKind } from "./types.ts";
import type { EdgepressContent } from "../services/edgepress-content.ts";
import { loadPublishedMenusByLocation } from "../services/menu-items-service.ts";
import { searchPosts } from "../services/search-service.ts";
import { resolveLocaleId } from "../services/post-translation-service.ts";
import { buildContentPostPayload } from "../../utils/content-post-payload.ts";
import { inArray } from "drizzle-orm";
import { injectCategoryMeta } from "./post-category-meta.ts";

function buildThemeMenusRecord(
  menusByLocation: Record<string, { label: string; url: string }[]>,
  currentPath: string,
): Record<string, MenuItem[]> {
  const normPath = currentPath.replace(/\/+$/, "") || "/";
  const menus: Record<string, MenuItem[]> = {};
  for (const [location, items] of Object.entries(menusByLocation)) {
    menus[location] = items.map((item) => ({
      label: item.label,
      url: item.url,
      active:
        item.url !== "" &&
        normPath === item.url.replace(/\/+$/, ""),
    }));
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
  const themeSupports = pkg.manifest.supports ?? [];
  const homeContentKey = pkg.manifest.home_content_key ?? "hello-world";
  const homeListPosts = pkg.manifest.home_list_posts === true;

  const menusPromise = loadPublishedMenusByLocation(db, dbLocale);

  if (route.kind === "taxonomy" && route.taxonomyType && route.taxonomySlug) {
    const listPage = route.page ?? 1;
    const [term, menusByLocation, listResult] = await Promise.all([
      getPublicTaxonomyTerm(db, route.taxonomyType, route.taxonomySlug),
      menusPromise,
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
        supports: themeSupports,
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
      is_search: false,
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

  if (route.kind === "search") {
    const q = route.searchQuery ?? "";
    const page = route.page ?? 1;
    const postTypeFilter = requestUrl.searchParams.get("post_type")?.trim() || undefined;
    const localeId = await resolveLocaleId(dbLocale, db);
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
            return enrichPostViewWithCover(toPostView(detail), detail, baseUrl, attachmentCache);
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
      ...(posts[0]?.cover_image ? { ogImage: posts[0].cover_image } : {}),
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
      locale_switcher: buildLocaleSwitcher(locale, route, "search"),
      theme: {
        slug: pkg.manifest.slug,
        version: pkg.manifest.version,
        asset_base_url: assetBase,
        supports: themeSupports,
      },
      route: {
        kind: "search",
        path: route.path,
        locale,
      },
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

  const menus = buildThemeMenusRecord(menusByLocation, route.path);

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
      supports: themeSupports,
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
    is_search: false,
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
