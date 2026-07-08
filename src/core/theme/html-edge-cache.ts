import { env as cfEnv } from "cloudflare:workers";
import type { KVLike } from "../../utils/runtime-locals.ts";
import type { ThemeRouteKind } from "./types.ts";

export const HTML_CACHE_VERSION_KV_KEY = "html:cache:version";

const PUBLIC_URL_LOCALES = [
  { urlLocale: "pt-br", pathPrefix: "" },
  { urlLocale: "en", pathPrefix: "/en" },
  { urlLocale: "es", pathPrefix: "/es" },
] as const;

export function isHtmlCacheableRouteKind(kind: ThemeRouteKind): boolean {
  return kind !== "404" && kind !== "search";
}

export async function getHtmlCacheVersion(kv: KVLike | null): Promise<number> {
  if (!kv) return 0;
  try {
    const raw = await kv.get(HTML_CACHE_VERSION_KV_KEY);
    const parsed = parseInt(String(raw ?? "0"), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export async function bumpHtmlCacheVersion(kv: KVLike): Promise<number> {
  const next = (await getHtmlCacheVersion(kv)) + 1;
  try {
    await kv.put(HTML_CACHE_VERSION_KV_KEY, String(next));
  } catch {
    // ignora falha de KV
  }
  return next;
}

export function buildHtmlCacheRequest(request: Request, version: number): Request {
  const url = new URL(request.url);
  url.searchParams.set("__cv", String(version));
  return new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
  });
}

export async function matchHtmlEdgeCache(cacheKey: Request): Promise<Response | null> {
  try {
    return (await caches.default.match(cacheKey)) ?? null;
  } catch {
    return null;
  }
}

export async function putHtmlEdgeCache(
  cacheKey: Request,
  response: Response,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<void> {
  const putPromise = caches.default.put(cacheKey, response.clone());
  if (waitUntil) {
    waitUntil(putPromise);
  } else {
    await putPromise;
  }
}

export function getPublicSiteOrigin(): string {
  const fromEnv = String(cfEnv.BETTER_AUTH_URL ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "http://localhost:8787";
}

export function buildPublicPageUrls(origin: string, path: string): string[] {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = origin.replace(/\/+$/, "");
  return PUBLIC_URL_LOCALES.map(({ pathPrefix }) => {
    const fullPath =
      pathPrefix === ""
        ? normalizedPath
        : `${pathPrefix}${normalizedPath}`.replace(/\/{2,}/g, "/");
    return `${base}${fullPath}`;
  });
}

export async function purgeHtmlEdgeCacheUrls(
  urls: string[],
  version: number,
): Promise<void> {
  for (const url of urls) {
    try {
      const cacheKey = buildHtmlCacheRequest(new Request(url), version);
      await caches.default.delete(cacheKey);
    } catch {
      // ignora falha de purge pontual
    }
  }
}

export async function purgePostPublicHtmlCache(
  kv: KVLike,
  slug: string,
  extraPaths: string[] = [],
): Promise<void> {
  const trimmed = slug.trim();
  if (!trimmed) return;
  const origin = getPublicSiteOrigin();
  const version = await getHtmlCacheVersion(kv);
  const urls = [
    ...buildPublicPageUrls(origin, `/${trimmed}`),
    ...extraPaths.flatMap((path) => buildPublicPageUrls(origin, path)),
  ];
  await purgeHtmlEdgeCacheUrls(urls, version);
}
