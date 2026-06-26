/**
 * Upload e instalação de temas via arquivo ZIP ou tar.gz.
 * POST multipart/form-data → /api/themes/upload
 */
import type { APIRoute } from "astro";
import { db } from "../../db/index.ts";
import { locales, posts } from "../../db/schema.ts";
import { and, eq } from "drizzle-orm";
import {
  createPost,
  getPostTypeId,
  updatePost,
  updatePostMetaValues,
} from "../../core/services/post-service.ts";
import { parseThemeArchive } from "../../core/services/theme-archive.ts";
import { collectPackageFromEntries } from "../../core/services/theme-package-collector.ts";
import { installThemePackage } from "../../core/services/theme-install.ts";
import {
  buildThemePathFromSlug,
  getThemeSnapshotById,
  isThemeActiveFlag,
  normalizeSupports,
  normalizeThemeSlug,
  parseThemeImportState,
  validateThemeCanonicalMeta,
  withThemeImportState,
  type ThemeCanonicalMeta,
} from "../../core/services/theme-service.ts";
import { requireMinRole } from "../../utils/api-auth.ts";
import { handleApiError } from "../../utils/error-handler.ts";
import {
  badRequestHtmlResponse,
  badRequestResponse,
  htmxRedirectResponse,
  redirectResponse,
} from "../../utils/http-responses.ts";
import { getString } from "../../utils/form-data.ts";
import { stringifyMetaValues } from "../../utils/meta-parser.ts";
import { parseNumericId } from "../../utils/validation.ts";
import { buildAbsoluteUrl, buildListUrl } from "../../utils/url.ts";
import {
  adminUrlLocaleToDbCode,
} from "../../utils/admin-locale-constants.ts";
import { syncThemeCache, syncThemeStatusCacheByPostId } from "../../utils/kv-cache-sync.ts";

export const prerender = false;

const MAX_ARCHIVE_SIZE = 25 * 1024 * 1024;

function isHtmxRequest(request: Request): boolean {
  return request.headers.get("HX-Request") === "true";
}

function getThemeZipFile(formData: FormData): File | null {
  const direct = formData.get("theme_zip");
  if (direct instanceof File && direct.size > 0) return direct;
  return null;
}

function buildThemeMetaValues(
  slug: string,
  requestedActive: boolean,
  importStatus: string,
): Record<string, string> {
  return {
    theme_slug: normalizeThemeSlug(slug),
    theme_path: buildThemePathFromSlug(slug),
    supports: "single,archive,page",
    requested_active: requestedActive ? "1" : "0",
    is_active: "0",
    import_status: importStatus,
  };
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const authResult = await requireMinRole(request, 1, locals);
    if (authResult instanceof Response) return authResult;

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return badRequestResponse("Expected multipart/form-data");
    }

    const formData = await request.formData();
    const isHtmx = isHtmxRequest(request);
    const adminLocale = getString(formData, "locale", "pt-br");
    const postTypeSlug = getString(formData, "post_type", "themes");
    const action = getString(formData, "action", "new");
    const title = getString(formData, "title");
    const slug = getString(formData, "slug");
    const postIdParam = getString(formData, "id");
    const requestedActive = isThemeActiveFlag(getString(formData, "meta_is_active"));
    const themeZip = getThemeZipFile(formData);

    if (!title || !slug) {
      const message = "Título e slug são obrigatórios";
      if (isHtmx) return badRequestHtmlResponse(message);
      return badRequestResponse(message);
    }

    const canonicalMeta: ThemeCanonicalMeta = {
      theme_slug: normalizeThemeSlug(slug),
      theme_path: buildThemePathFromSlug(slug),
      supports: normalizeSupports("single,archive,page"),
    };

    const validation = validateThemeCanonicalMeta(canonicalMeta);
    if (!validation.valid) {
      const message = `Tema inválido: ${validation.errors.join("; ")}`;
      if (isHtmx) return badRequestHtmlResponse(message);
      return badRequestResponse(message, { theme: validation.errors });
    }

    const postTypeId = await getPostTypeId(db, postTypeSlug);
    if (!postTypeId) {
      return badRequestResponse("Post type themes not found");
    }

    const existingThemeState =
      action === "edit" && postIdParam && parseNumericId(postIdParam)
        ? await getThemeSnapshotById(db, parseInt(postIdParam, 10))
        : null;
    const existingImportState = parseThemeImportState(existingThemeState?.meta_values ?? null);
    const isAlreadyReady = existingImportState.import_status === "ready";

    if (requestedActive && !themeZip && action === "new") {
      const message = "Envie o arquivo ZIP do tema para ativar um tema novo";
      if (isHtmx) return badRequestHtmlResponse(message);
      return badRequestResponse(message);
    }

    if (requestedActive && !themeZip && action === "edit" && !isAlreadyReady) {
      const message = "Envie o arquivo ZIP do tema para ativar este tema";
      if (isHtmx) return badRequestHtmlResponse(message);
      return badRequestResponse(message);
    }

    const now = Date.now();
    let postId: number;
    const importStatus = themeZip ? "importing" : requestedActive && isAlreadyReady ? "ready" : "idle";
    const metaValues = buildThemeMetaValues(slug, requestedActive, importStatus);

    if (action === "edit" && postIdParam && parseNumericId(postIdParam)) {
      postId = parseInt(postIdParam, 10);
      await updatePost(db, postId, postTypeId, {
        title,
        slug,
        updated_at: now,
      });
      await updatePostMetaValues(db, postId, postTypeId, metaValues);
    } else {
      const [existingBySlug] = await db
        .select({ id: posts.id })
        .from(posts)
        .where(and(eq(posts.slug, slug), eq(posts.post_type_id, postTypeId)))
        .limit(1);
      if (existingBySlug) {
        const message = "Já existe um tema com este slug";
        if (isHtmx) return badRequestHtmlResponse(message);
        return badRequestResponse(message);
      }

      let localeId: number | null = null;
      const dbLocaleCode = adminUrlLocaleToDbCode(adminLocale);
      const [localeRow] = await db
        .select({ id: locales.id })
        .from(locales)
        .where(eq(locales.locale_code, dbLocaleCode))
        .limit(1);
      localeId = localeRow?.id ?? null;

      postId = await createPost(db, {
        post_type_id: postTypeId,
        parent_id: null,
        title,
        slug,
        excerpt: null,
        body: null,
        status: "published",
        author_id: authResult.user.id,
        id_locale_code: localeId,
        meta_values: stringifyMetaValues(metaValues),
        created_at: now,
        updated_at: now,
      });
    }

    if (themeZip) {
      if (themeZip.size > MAX_ARCHIVE_SIZE) {
        const message = "Arquivo do tema excede o limite de 25 MB";
        if (isHtmx) return badRequestHtmlResponse(message);
        return badRequestResponse(message);
      }

      const lowerName = themeZip.name.toLowerCase();
      if (!lowerName.endsWith(".zip") && !lowerName.endsWith(".tar.gz") && !lowerName.endsWith(".tgz")) {
        const message = "Formato inválido. Use .zip ou .tar.gz";
        if (isHtmx) return badRequestHtmlResponse(message);
        return badRequestResponse(message);
      }

      try {
        const buffer = await themeZip.arrayBuffer();
        const entries = await parseThemeArchive(buffer, themeZip.name);
        const { manifest, templates, assets } = collectPackageFromEntries(entries);
        await installThemePackage(locals, {
          themePostId: postId,
          themeSlug: slug,
          manifest,
          templates,
          assets,
          activate: requestedActive,
        });
      } catch (err) {
        const failedMeta = withThemeImportState(
          JSON.stringify(metaValues),
          {
            requested_active: false,
            is_active: false,
            import_status: "failed",
            import_error: err instanceof Error ? err.message : "Erro ao importar tema",
          },
        );
        await updatePost(db, postId, postTypeId, {
          meta_values: failedMeta,
          updated_at: Date.now(),
        });
        await syncThemeStatusCacheByPostId(locals, db, postId);
        await syncThemeCache(locals, db);

        const message = err instanceof Error ? err.message : "Erro ao importar tema";
        if (isHtmx) return badRequestHtmlResponse(message);
        return badRequestResponse(message);
      }
    } else if (requestedActive && isAlreadyReady && action === "edit") {
      const activeMeta = withThemeImportState(existingThemeState?.meta_values ?? null, {
        requested_active: false,
        is_active: true,
        import_status: "ready",
        import_error: undefined,
      });
      await updatePost(db, postId, postTypeId, {
        meta_values: activeMeta,
        updated_at: Date.now(),
      });
      const { enforceSingleActiveTheme } = await import("../../core/services/theme-service.ts");
      await enforceSingleActiveTheme(db, postId);
      await syncThemeStatusCacheByPostId(locals, db, postId);
      await syncThemeCache(locals, db);
    } else if (!themeZip) {
      await syncThemeStatusCacheByPostId(locals, db, postId);
      await syncThemeCache(locals, db);
    }

    const listUrl = buildAbsoluteUrl(request, buildListUrl(adminLocale, postTypeSlug));
    if (isHtmx) return htmxRedirectResponse(listUrl);
    return redirectResponse(listUrl);
  } catch (err) {
    return handleApiError(err, "POST /api/themes/upload");
  }
};
