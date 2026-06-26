import { db } from "../../db/index.ts";
import { getActiveThemeSlugFromSettings } from "../services/settings-service.ts";
import { getKvFromLocals } from "../../utils/runtime-locals.ts";
import { loadThemePackage } from "./theme-package.ts";
import { buildThemeRenderContext } from "./context.ts";
import { renderTheme } from "./render.ts";
import { resolvePublicRoute } from "./resolve-route.ts";
import { defaultThemePackage } from "../../themes/2026/bundle.ts";

const FALLBACK_THEME_SLUG = "2026";

export async function handlePublicThemeRequest(
  request: Request,
  locals: App.Locals,
): Promise<Response> {
  const url = new URL(request.url);
  const route = resolvePublicRoute(url.pathname, url.searchParams);

  const kv = getKvFromLocals(locals);
  const activeSlug =
    (await getActiveThemeSlugFromSettings(db, {
      kv,
      isAuthenticated: Boolean(locals.user),
    }))?.trim() || FALLBACK_THEME_SLUG;

  let pkg = await loadThemePackage(kv, activeSlug);
  if (!pkg && activeSlug === FALLBACK_THEME_SLUG) {
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
