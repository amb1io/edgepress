import { db } from "../../db/index.ts";
import { getActiveThemeFromDb, getThemeSnapshotById } from "../services/theme-service.ts";
import { getKvFromLocals } from "../../utils/runtime-locals.ts";
import { parseMetaValues } from "../../utils/meta-parser.ts";
import { loadThemePackage } from "./theme-package.ts";
import { buildThemeRenderContext } from "./context.ts";
import { renderTheme } from "./render.ts";
import { resolvePublicRoute } from "./resolve-route.ts";
import { defaultThemePackage } from "../../themes/2026/bundle.ts";
import { blogRhamsesThemePackage } from "../../themes-default/blog-rhamses/bundle.ts";

const FALLBACK_THEME_SLUG = "2026";
const BUNDLED_THEMES: Record<string, typeof defaultThemePackage> = {
  "2026": defaultThemePackage,
  "blog-rhamses": blogRhamsesThemePackage,
};

export async function handlePublicThemeRequest(
  request: Request,
  locals: App.Locals,
): Promise<Response> {
  const url = new URL(request.url);
  const route = resolvePublicRoute(url.pathname, url.searchParams);

  const kv = getKvFromLocals(locals);
  const activeTheme = await getActiveThemeFromDb(db);
  const activeSlug = activeTheme.is_active ? activeTheme.meta.theme_slug?.trim() : "";
  const packageSlug = activeSlug || FALLBACK_THEME_SLUG;

  let pkg = await loadThemePackage(kv, packageSlug);
  if (!pkg) {
    pkg = BUNDLED_THEMES[packageSlug] ?? null;
  }
  if (!pkg && activeTheme.id) {
    const snapshot = await getThemeSnapshotById(db, activeTheme.id);
    const legacySlug = parseMetaValues(snapshot?.meta_values ?? null)["manifest_slug"]?.trim();
    if (legacySlug && legacySlug !== packageSlug) {
      pkg = await loadThemePackage(kv, legacySlug);
      if (!pkg) {
        pkg = BUNDLED_THEMES[legacySlug] ?? null;
      }
    }
  }
  if (!pkg && packageSlug === FALLBACK_THEME_SLUG) {
    pkg = defaultThemePackage;
  }
  if (!pkg) {
    return new Response("Theme package not found", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const ctx = await buildThemeRenderContext(locals, url, route, pkg);
  const html = await renderTheme(pkg, ctx);

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": ctx.route.kind === "404" ? "no-store" : "public, max-age=60",
  });

  return new Response(html, {
    status: ctx.route.kind === "404" ? 404 : 200,
    headers,
  });
}
