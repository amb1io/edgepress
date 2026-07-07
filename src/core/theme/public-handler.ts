import { db } from "../../db/index.ts";
import { getActiveThemeFromDb, getThemeSnapshotById } from "../services/theme-service.ts";
import { getKvFromLocals } from "../../utils/runtime-locals.ts";
import { parseMetaValues } from "../../utils/meta-parser.ts";
import { loadThemePackage } from "./theme-package.ts";
import { buildThemeRenderContext } from "./context.ts";
import { renderTheme } from "./render.ts";
import { resolveThemeRouteForRequest } from "./resolve-theme-route-db.ts";

export async function handlePublicThemeRequest(
  request: Request,
  locals: App.Locals,
): Promise<Response> {
  const url = new URL(request.url);

  const kv = getKvFromLocals(locals);
  const activeTheme = await getActiveThemeFromDb(db);
  const activeSlug = activeTheme.is_active ? activeTheme.meta.theme_slug?.trim() : "";
  const packageSlug = activeSlug || "";

  let pkg = packageSlug ? await loadThemePackage(kv, packageSlug) : null;

  if (!pkg && activeTheme.id) {
    const snapshot = await getThemeSnapshotById(db, activeTheme.id);
    const legacySlug = parseMetaValues(snapshot?.meta_values ?? null)["manifest_slug"]?.trim();
    if (legacySlug && legacySlug !== packageSlug) {
      pkg = await loadThemePackage(kv, legacySlug);
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
