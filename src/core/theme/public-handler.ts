import { env as cfEnv } from "cloudflare:workers";
import { db } from "../../db/index.ts";
import { getActiveTheme, getThemeSnapshotById } from "../services/theme-service.ts";
import {
  getCacheKvFromLocals,
  getExecutionContextFromLocals,
  getKvFromLocals,
  isAuthenticatedFromLocals,
} from "../../utils/runtime-locals.ts";
import { parseMetaValues } from "../../utils/meta-parser.ts";
import { loadThemePackage } from "./theme-package.ts";
import { buildThemeRenderContext } from "./context.ts";
import { renderTheme } from "./render.ts";
import { resolveThemeRouteForRequest } from "./resolve-theme-route-db.ts";
import {
  buildHtmlCacheRequest,
  getHtmlCacheVersion,
  isHtmlCacheableRouteKind,
  matchHtmlEdgeCache,
  putHtmlEdgeCache,
} from "./html-edge-cache.ts";

export async function handlePublicThemeRequest(
  request: Request,
  locals: App.Locals,
): Promise<Response> {
  const url = new URL(request.url);
  const authenticated = isAuthenticatedFromLocals(locals);
  const kv = getKvFromLocals(locals);
  const cacheKv = getCacheKvFromLocals(locals);
  const bucket = cfEnv.MEDIA_BUCKET ?? null;

  const activeTheme = await getActiveTheme(db, cacheKv);
  const activeSlug = activeTheme.is_active ? activeTheme.meta.theme_slug?.trim() : "";
  const packageSlug = activeSlug || "";

  let pkg = packageSlug ? await loadThemePackage(kv, packageSlug, bucket) : null;

  if (!pkg && activeTheme.id) {
    const snapshot = await getThemeSnapshotById(db, activeTheme.id);
    const legacySlug = parseMetaValues(snapshot?.meta_values ?? null)["manifest_slug"]?.trim();
    if (legacySlug && legacySlug !== packageSlug) {
      pkg = await loadThemePackage(kv, legacySlug, bucket);
    }
  }

  if (!pkg) {
    return new Response("No theme installed", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const route = await resolveThemeRouteForRequest(
    locals,
    url.pathname,
    url.searchParams,
    Object.keys(pkg.templates),
  );

  if (!authenticated && isHtmlCacheableRouteKind(route.kind)) {
    const version = await getHtmlCacheVersion(cacheKv);
    const cacheKey = buildHtmlCacheRequest(request, version);
    const cached = await matchHtmlEdgeCache(cacheKey);
    if (cached) return cached;
  }

  const ctx = await buildThemeRenderContext(locals, url, route, pkg);
  const html = await renderTheme(pkg, ctx);

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": ctx.route.kind === "404" ? "no-store" : "public, max-age=60",
  });

  const response = new Response(html, {
    status: ctx.route.kind === "404" ? 404 : 200,
    headers,
  });

  if (!authenticated && isHtmlCacheableRouteKind(ctx.route.kind)) {
    const version = await getHtmlCacheVersion(cacheKv);
    const cacheKey = buildHtmlCacheRequest(request, version);
    const cfContext = getExecutionContextFromLocals(locals);
    await putHtmlEdgeCache(cacheKey, response, cfContext?.waitUntil.bind(cfContext));
  }

  return response;
}
