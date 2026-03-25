import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { getPostTypeId, updatePost } from "../../../lib/services/post-service.ts";
import {
  enforceSingleActiveTheme,
  hasValidThemePackageMeta,
  getThemeSnapshotById,
  getThemeSnapshotBySlug,
  validateThemeCanonicalMeta,
  withThemeImportState,
} from "../../../lib/services/theme-service.ts";
import {
  syncThemeCache,
  syncThemeStatusCacheByPostId,
} from "../../../lib/kv-cache-sync.ts";
import {
  badRequestResponse,
  jsonResponse,
} from "../../../lib/utils/http-responses.ts";
import { env as cfEnv } from "cloudflare:workers";

export const prerender = false;

function isAuthorized(request: Request, expectedSecret: string): boolean {
  const headerSecret = request.headers.get("x-theme-import-secret") ?? "";
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  return (
    headerSecret.trim() === expectedSecret.trim() ||
    bearer.trim() === expectedSecret.trim()
  );
}

export const POST: APIRoute = async ({ request, locals }) => {
  const callbackSecret = String(cfEnv.THEME_IMPORT_CALLBACK_SECRET ?? "").trim();
  if (!callbackSecret) {
    return new Response(
      JSON.stringify({ ok: false, error: "Theme callback secret not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  if (!isAuthorized(request, callbackSecret)) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await request.json().catch(() => ({}))) as {
    theme_post_id?: number;
    theme_slug?: string;
    status?: string;
    success?: boolean;
    message?: string;
    commit_sha?: string;
    r2_key?: string;
    version?: string;
    checksum?: string;
    manifest_key?: string;
  };

  const success =
    body.success === true ||
    String(body.status ?? "").trim().toLowerCase() === "success";
  const failureMessage = String(body.message ?? "").trim();
  const commitSha = String(body.commit_sha ?? "").trim();
  const r2Key = String(body.r2_key ?? "").trim();
  const packageVersion = String(body.version ?? "").trim();
  const packageChecksum = String(body.checksum ?? "").trim();
  const manifestKey = String(body.manifest_key ?? "").trim();

  const snapshot =
    typeof body.theme_post_id === "number" && body.theme_post_id > 0
      ? await getThemeSnapshotById(db, body.theme_post_id)
      : body.theme_slug
      ? await getThemeSnapshotBySlug(db, body.theme_slug)
      : null;

  if (!snapshot) {
    return badRequestResponse("Theme not found for callback");
  }

  const themesTypeId = await getPostTypeId(db, "themes");
  if (!themesTypeId) {
    return badRequestResponse("Themes post type not found");
  }

  let existingMeta: Record<string, string> = {};
  if (snapshot.meta_values) {
    try {
      existingMeta = JSON.parse(snapshot.meta_values) as Record<string, string>;
    } catch {
      existingMeta = {};
    }
  }
  if (r2Key) existingMeta["r2_key"] = r2Key;
  if (packageVersion) existingMeta["package_version"] = packageVersion;
  if (packageChecksum) existingMeta["package_checksum"] = packageChecksum;
  if (manifestKey) existingMeta["manifest_key"] = manifestKey;

  const candidateMeta = {
    ...snapshot.canonical_meta,
    ...(r2Key ? { r2_key: r2Key } : {}),
    ...(packageVersion ? { package_version: packageVersion } : {}),
    ...(packageChecksum ? { package_checksum: packageChecksum } : {}),
    ...(manifestKey ? { manifest_key: manifestKey } : {}),
  };
  const packageValidation = validateThemeCanonicalMeta(candidateMeta, {
    requirePackageMeta: success,
  });
  const canActivate = success && packageValidation.valid && hasValidThemePackageMeta(candidateMeta);

  const nextMetaValues = withThemeImportState(JSON.stringify(existingMeta), {
    requested_active: false,
    is_active: canActivate,
    import_status: canActivate ? "ready" : success ? "packaged" : "failed",
    import_error: canActivate
      ? undefined
      : success
        ? "Theme packaged, aguardando hidratação no deploy"
        : (failureMessage || "Theme import failed"),
    import_commit_sha: commitSha || undefined,
  });

  await updatePost(db, snapshot.id, themesTypeId, {
    meta_values: nextMetaValues,
    updated_at: Date.now(),
  });

  if (canActivate) {
    await enforceSingleActiveTheme(db, snapshot.id);
  }

  await syncThemeStatusCacheByPostId(locals, db, snapshot.id);
  await syncThemeCache(locals, db);

  return jsonResponse({
    ok: true,
    theme_post_id: snapshot.id,
    theme_slug: snapshot.slug,
    status: canActivate ? "ready" : success ? "packaged" : "failed",
  });
};
