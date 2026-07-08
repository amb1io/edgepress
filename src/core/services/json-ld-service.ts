import { eq } from "drizzle-orm";
import { posts, postTypes, user } from "../../db/schema.ts";
import type { Database } from "../../shared/types/database.ts";
import type { SeoApiPayload } from "./seo-metadata-service.ts";
import {
  buildPublicPostPath,
  getSiteOrigin,
  normalizeSiteOrigin,
  type SettingsCacheOptions,
} from "./sitemap-service.ts";
import { getSettingsWithCache } from "./settings-service.ts";

const SCHEMA_CONTEXT = "https://schema.org";
const MAX_ANCESTOR_DEPTH = 10;

export type JsonLdPostInput = {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  author_id: string | null;
  parent_id: number | null;
  published_at: number | null;
  created_at: number | null;
  updated_at: number | null;
  meta_values: Record<string, unknown>;
};

export type JsonLdBuildContext = {
  post_type_slug: string;
  seo: SeoApiPayload | null;
  origin: string;
  site_name: string;
  site_description: string;
  author_name?: string;
  image_url?: string;
  media?: Record<string, unknown>[];
};

export type PageAncestor = {
  title: string;
  slug: string;
};

export function stripHtml(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsoDate(ts: number | null | undefined): string | undefined {
  if (ts == null) return undefined;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function absoluteUrl(origin: string, publicPath: string): string {
  const base = normalizeSiteOrigin(origin);
  const path = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  return `${base}${path}`;
}

function withSchemaContext(obj: Record<string, unknown>): Record<string, unknown> {
  return { "@context": SCHEMA_CONTEXT, ...obj };
}

function resolveImageUrl(
  origin: string,
  metaValues: Record<string, unknown>,
  media?: Record<string, unknown>[],
): string | undefined {
  const thumbIdRaw = metaValues.post_thumbnail_id;
  const thumbId =
    typeof thumbIdRaw === "number"
      ? thumbIdRaw
      : typeof thumbIdRaw === "string"
        ? parseInt(thumbIdRaw, 10)
        : NaN;

  if (!media?.length) return undefined;

  for (const item of media) {
    const id = item.id;
    if (thumbId && !Number.isNaN(thumbId) && id !== thumbId) continue;

    const meta = (item.meta_values ?? {}) as Record<string, unknown>;
    const path =
      (typeof meta.attachment_path === "string" && meta.attachment_path) ||
      (typeof meta.attachment_file === "string" && meta.attachment_file) ||
      "";

    if (!path) continue;

    if (/^https?:\/\//i.test(path)) return path;
    const apiPath =
      path.startsWith("/uploads/") || path.startsWith("/")
        ? `/api/media${path.startsWith("/") ? path : `/${path}`}`
        : `/api/media/uploads/${path}`;
    return absoluteUrl(origin, apiPath);
  }

  return undefined;
}

export async function resolvePageAncestors(
  db: Database,
  postId: number,
  pageTypeId: number,
): Promise<PageAncestor[]> {
  const ancestors: PageAncestor[] = [];
  let currentParentId: number | null = null;

  const [start] = await db
    .select({ parent_id: posts.parent_id })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);

  currentParentId = start?.parent_id ?? null;

  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && currentParentId; depth++) {
    const [row] = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        parent_id: posts.parent_id,
        post_type_id: posts.post_type_id,
        status: posts.status,
      })
      .from(posts)
      .where(eq(posts.id, currentParentId))
      .limit(1);

    if (!row || row.status !== "published" || row.post_type_id !== pageTypeId) break;

    ancestors.unshift({ title: row.title, slug: row.slug });
    currentParentId = row.parent_id;
  }

  return ancestors;
}

function buildListItem(
  position: number,
  name: string,
  itemUrl?: string,
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    "@type": "ListItem",
    position,
    name,
  };
  if (itemUrl) entry.item = itemUrl;
  return entry;
}

export function buildBreadcrumbListJsonLd(
  post: JsonLdPostInput,
  context: JsonLdBuildContext,
  ancestors: PageAncestor[] = [],
): Record<string, unknown> | null {
  const { origin, site_name, post_type_slug, seo } = context;
  if (!origin) return null;

  const homeName = site_name.trim() || "Home";
  const items: Record<string, unknown>[] = [];
  let position = 1;

  items.push(buildListItem(position++, homeName, absoluteUrl(origin, "/")));

  if (post_type_slug === "post") {
    items.push(buildListItem(position++, "Posts", absoluteUrl(origin, "/posts")));
    const pageUrl =
      seo?.canonical && /^https?:\/\//i.test(seo.canonical)
        ? seo.canonical
        : absoluteUrl(origin, buildPublicPostPath(post.slug));
    items.push(buildListItem(position, post.title, pageUrl));
  } else if (post_type_slug === "page") {
    for (const ancestor of ancestors) {
      items.push(
        buildListItem(
          position++,
          ancestor.title,
          absoluteUrl(origin, buildPublicPostPath(ancestor.slug)),
        ),
      );
    }
    const pageUrl =
      seo?.canonical && /^https?:\/\//i.test(seo.canonical)
        ? seo.canonical
        : absoluteUrl(origin, buildPublicPostPath(post.slug));
    items.push(buildListItem(position, post.title, pageUrl));
  } else {
    return null;
  }

  if (items.length < 2) return null;

  return withSchemaContext({
    "@type": "BreadcrumbList",
    itemListElement: items,
  });
}

export function buildArticleJsonLd(
  post: JsonLdPostInput,
  context: JsonLdBuildContext,
): Record<string, unknown> | null {
  const { origin, site_name, seo, author_name, image_url } = context;
  if (!origin) return null;

  const headline = seo?.title?.trim() || post.title;
  const description =
    seo?.description?.trim() ||
    stripHtml(post.excerpt) ||
    stripHtml(post.body).slice(0, 300);
  const url =
    seo?.canonical && /^https?:\/\//i.test(seo.canonical)
      ? seo.canonical
      : absoluteUrl(origin, buildPublicPostPath(post.slug));

  const article: Record<string, unknown> = {
    "@type": "Article",
    headline,
    description,
    url,
    datePublished: toIsoDate(post.published_at ?? post.created_at),
    dateModified: toIsoDate(post.updated_at ?? post.published_at ?? post.created_at),
    publisher: {
      "@type": "Organization",
      name: site_name || "Site",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
  };

  if (author_name) {
    article.author = { "@type": "Person", name: author_name };
  }
  if (image_url) {
    article.image = [image_url];
  }

  return withSchemaContext(article);
}

export function buildWebPageJsonLd(
  post: JsonLdPostInput,
  context: JsonLdBuildContext,
): Record<string, unknown> | null {
  const { origin, site_name, site_description, seo, image_url } = context;
  if (!origin) return null;

  const name = seo?.title?.trim() || post.title;
  const description =
    seo?.description?.trim() ||
    stripHtml(post.excerpt) ||
    stripHtml(post.body).slice(0, 300);
  const url =
    seo?.canonical && /^https?:\/\//i.test(seo.canonical)
      ? seo.canonical
      : absoluteUrl(origin, buildPublicPostPath(post.slug));

  const webPage: Record<string, unknown> = {
    "@type": "WebPage",
    name,
    description,
    url,
    datePublished: toIsoDate(post.published_at ?? post.created_at),
    dateModified: toIsoDate(post.updated_at ?? post.published_at ?? post.created_at),
    isPartOf: {
      "@type": "WebSite",
      name: site_name || "Site",
      url: origin,
      ...(site_description ? { description: site_description } : {}),
    },
  };

  if (image_url) {
    webPage.primaryImageOfPage = { "@type": "ImageObject", url: image_url };
  }

  return withSchemaContext(webPage);
}

export async function buildWebSiteJsonLd(
  db: Database,
  baseUrl?: string,
  cacheOptions: SettingsCacheOptions = {},
): Promise<Record<string, unknown>[]> {
  const origin = normalizeSiteOrigin(
    baseUrl ?? (await getSiteOrigin(db, {}, cacheOptions)),
  );
  if (!origin) return [];

  const settings = await getSettingsWithCache(db, {
    namesParam: "site_name,site_description",
    kv: cacheOptions.kv ?? null,
    isAuthenticated: cacheOptions.isAuthenticated ?? false,
  });
  const name = (settings.site_name ?? "").trim() || "Site";
  const description = (settings.site_description ?? "").trim();

  const graph = withSchemaContext({
    "@type": "WebSite",
    name,
    url: origin,
    ...(description ? { description } : {}),
  });

  return [graph];
}

export async function buildPostJsonLd(
  db: Database,
  post: JsonLdPostInput,
  context: Omit<JsonLdBuildContext, "origin" | "site_name" | "site_description"> & {
    baseUrl?: string;
    kv?: SettingsCacheOptions["kv"];
    isAuthenticated?: boolean;
  },
): Promise<Record<string, unknown>[]> {
  const cacheOptions: SettingsCacheOptions = {
    kv: context.kv ?? null,
    isAuthenticated: context.isAuthenticated ?? false,
  };
  const origin = normalizeSiteOrigin(
    context.baseUrl ?? (await getSiteOrigin(db, {}, cacheOptions)),
  );
  if (!origin) return [];

  const settings = await getSettingsWithCache(db, {
    namesParam: "site_name,site_description",
    kv: cacheOptions.kv ?? null,
    isAuthenticated: cacheOptions.isAuthenticated ?? false,
  });

  let author_name: string | undefined;
  if (post.author_id) {
    const [authorRow] = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, post.author_id))
      .limit(1);
    author_name = authorRow?.name ?? undefined;
  }

  const image_url = resolveImageUrl(origin, post.meta_values, context.media);

  const fullContext: JsonLdBuildContext = {
    ...context,
    origin,
    site_name: settings.site_name ?? "",
    site_description: settings.site_description ?? "",
    author_name,
    image_url,
  };

  const graphs: Record<string, unknown>[] = [];

  let ancestors: PageAncestor[] = [];
  if (context.post_type_slug === "page") {
    const [pageType] = await db
      .select({ id: postTypes.id })
      .from(postTypes)
      .where(eq(postTypes.slug, "page"))
      .limit(1);
    if (pageType) {
      ancestors = await resolvePageAncestors(db, post.id, pageType.id);
    }
  }

  const breadcrumb = buildBreadcrumbListJsonLd(post, fullContext, ancestors);
  if (breadcrumb) graphs.push(breadcrumb);

  if (context.post_type_slug === "post") {
    const article = buildArticleJsonLd(post, fullContext);
    if (article) graphs.push(article);
  } else if (context.post_type_slug === "page") {
    const webPage = buildWebPageJsonLd(post, fullContext);
    if (webPage) graphs.push(webPage);
  }

  return graphs;
}
