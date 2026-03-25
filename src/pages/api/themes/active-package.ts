import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { getActiveThemeFromDb, hasValidThemePackageMeta } from "../../../lib/services/theme-service.ts";
import { jsonResponse } from "../../../lib/utils/http-responses.ts";
import { env as cfEnv } from "cloudflare:workers";

export const prerender = false;

function isAuthorized(request: Request, expectedSecret: string): boolean {
  const headerSecret = request.headers.get("x-theme-package-secret") ?? "";
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  return (
    headerSecret.trim() === expectedSecret.trim() ||
    bearer.trim() === expectedSecret.trim()
  );
}

export const GET: APIRoute = async ({ request }) => {
  const secret = String(cfEnv.THEME_PACKAGE_METADATA_SECRET ?? "").trim();
  if (!secret) {
    return new Response(
      JSON.stringify({ ok: false, error: "THEME_PACKAGE_METADATA_SECRET is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!isAuthorized(request, secret)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const activeTheme = await getActiveThemeFromDb(db);
  const hasPackage = hasValidThemePackageMeta(activeTheme.meta);
  if (!hasPackage) {
    return jsonResponse({
      ok: true,
      has_active_theme_package: false,
      active_theme_slug: activeTheme.meta.theme_slug,
    });
  }

  return jsonResponse({
    ok: true,
    has_active_theme_package: true,
    active_theme_slug: activeTheme.meta.theme_slug,
    r2_key: activeTheme.meta.r2_key,
    package_version: activeTheme.meta.package_version,
    package_checksum: activeTheme.meta.package_checksum,
    manifest_key: activeTheme.meta.manifest_key ?? null,
  });
};
