import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { posts, postTypes, seoMetadata } from "../../db/schema.ts";
import type { Database } from "../../shared/types/database.ts";
import type { KVLike } from "../../utils/content-cache.ts";
import { getSettingsWithCache } from "./settings-service.ts";

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
};

export type SiteOriginEnvFallback = {
  siteUrl?: string;
  betterAuthUrl?: string;
};

export type SettingsCacheOptions = {
  kv?: KVLike | null;
  isAuthenticated?: boolean;
};

const PUBLIC_POST_TYPE_SLUGS = ["post", "page"] as const;

const EXCLUDED_PATH_PREFIXES = [
  "/admin",
  "/api",
  "/login",
  "/setup",
  "/themes",
] as const;

/**
 * Normaliza origem do site (sem barra final).
 */
export function normalizeSiteOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

/**
 * Origem do site: setting `site_url` no banco, depois env.
 */
export async function getSiteOrigin(
  db: Database,
  envFallback: SiteOriginEnvFallback = {},
  cacheOptions: SettingsCacheOptions = {},
): Promise<string> {
  const record = await getSettingsWithCache(db, {
    namesParam: "site_url",
    kv: cacheOptions.kv ?? null,
    isAuthenticated: cacheOptions.isAuthenticated ?? false,
  });
  const fromDb = normalizeSiteOrigin(record.site_url ?? "");
  if (fromDb) return fromDb;

  const fromEnv = normalizeSiteOrigin(
    envFallback.siteUrl ?? process.env.SITE_URL ?? "",
  );
  if (fromEnv) return fromEnv;

  const fromAuth = normalizeSiteOrigin(
    envFallback.betterAuthUrl ?? process.env.BETTER_AUTH_URL ?? "",
  );
  if (fromAuth) return fromAuth;

  return "";
}

export function buildPublicPostPath(slug: string): string {
  const clean = slug.trim().replace(/^\/+/, "");
  return clean ? `/${clean}` : "/";
}

/**
 * Resolve URL absoluta do sitemap. Canonical absoluto tem prioridade.
 */
export function resolveSitemapLoc(
  origin: string,
  publicPath: string,
  seoCanonical?: string | null,
): string {
  const canonical = (seoCanonical ?? "").trim();
  if (canonical && /^https?:\/\//i.test(canonical)) {
    return canonical;
  }
  const base = normalizeSiteOrigin(origin);
  if (!base) {
    return publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  }
  const path = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  return `${base}${path}`;
}

function formatLastmod(ts: number | null | undefined): string | undefined {
  if (ts == null) return undefined;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/**
 * URLs públicas para o sitemap (paths do browser, não /themes/...).
 */
export async function getSitemapEntries(db: Database): Promise<SitemapEntry[]> {
  const origin = await getSiteOrigin(db);
  const entries: SitemapEntry[] = [];
  const seenLocs = new Set<string>();

  function addEntry(loc: string, lastmod?: string): void {
    if (!loc || seenLocs.has(loc)) return;
    seenLocs.add(loc);
    entries.push(lastmod ? { loc, lastmod } : { loc });
  }

  if (origin) {
    addEntry(resolveSitemapLoc(origin, "/"));
    addEntry(resolveSitemapLoc(origin, "/posts"));
  }

  const typeRows = await db
    .select({ id: postTypes.id, slug: postTypes.slug })
    .from(postTypes)
    .where(inArray(postTypes.slug, [...PUBLIC_POST_TYPE_SLUGS]));

  const typeIds = typeRows.map((r) => r.id);
  if (typeIds.length === 0) return entries;

  const rows = await db
    .select({
      slug: posts.slug,
      updated_at: posts.updated_at,
      seo_canonical: seoMetadata.seo_canonical,
    })
    .from(posts)
    .leftJoin(seoMetadata, eq(seoMetadata.post_id, posts.id))
    .where(
      and(
        inArray(posts.post_type_id, typeIds),
        eq(posts.status, "published"),
        ne(posts.status, "trash"),
        sql`(json_extract(${posts.meta_values}, '$.show_in_menu') IS NULL OR json_extract(${posts.meta_values}, '$.show_in_menu') != 1)`,
      ),
    )
    .orderBy(posts.slug);

  for (const row of rows) {
    const publicPath = buildPublicPostPath(row.slug);
    const loc = resolveSitemapLoc(origin, publicPath, row.seo_canonical);
    addEntry(loc, formatLastmod(row.updated_at));
  }

  return entries.filter((e) => /^https?:\/\//i.test(e.loc));
}

/**
 * Lista de URLs absolutas para @astrojs/sitemap customPages.
 */
export async function getSitemapAbsoluteUrls(db: Database): Promise<string[]> {
  const entries = await getSitemapEntries(db);
  return entries
    .map((e) => e.loc)
    .filter((loc) => Boolean(loc) && /^https?:\/\//i.test(loc));
}

/**
 * Filtro de páginas auto-descobertas pelo @astrojs/sitemap (exclui admin/API).
 */
export function shouldExcludeSitemapPage(page: string): boolean {
  try {
    const pathname = new URL(page, "https://placeholder.local").pathname;
    return EXCLUDED_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  } catch {
    return true;
  }
}

/**
 * Gera XML urlset para endpoint SSR.
 */
export function buildSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const loc = escapeXml(entry.loc);
      const lastmod = entry.lastmod
        ? `\n    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`
        : "";
      return `  <url>\n    <loc>${loc}</loc>${lastmod}\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
