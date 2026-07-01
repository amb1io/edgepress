// Database
import { db } from "../../db/index.ts";
import { locales } from "../../db/schema.ts";
import { eq } from "drizzle-orm";

// Services
import {
  createPost,
  getPostTypeId,
  linkPostTaxonomies,
  postExists,
  processPostAttachments,
  updatePost,
  updatePostMetaValues,
} from "../../core/services/post-service.ts";

// Validators
import { validatePostForm } from "../../core/validators/post-validator.ts";

// Utils - Form Data
import {
  getFieldsWithPrefix,
  getNumber,
  getNumberArray,
  getOptionalNumber,
  getString,
} from "../../utils/form-data.ts";

// Utils - Validation & Parsing
import {
  normalizePostStatus,
  parseNumericId,
} from "../../utils/validation.ts";
import { stringifyMetaValues } from "../../utils/meta-parser.ts";
import { applyJobsCustomFieldsToMeta } from "../../utils/jobs-custom-fields.ts";
import {
  applyDiretoresCustomFieldsToMeta,
  postHasDiretoresCategory,
} from "../../utils/diretores-custom-fields.ts";

// Utils - HTTP & Errors
import { handleApiError } from "../../utils/error-handler.ts";
import {
  badRequestResponse,
  badRequestHtmlResponse,
  jsonResponse,
  redirectResponse,
  htmxRedirectResponse,
} from "../../utils/http-responses.ts";

// Utils - URLs
import {
  buildAbsoluteUrl,
  buildContentUrl,
  buildListUrl,
} from "../../utils/url.ts";

// Utils - Slug
import { slugify } from "../../utils/slugify.ts";

// Constants
import { getErrorMessage } from "../../shared/constants/error-messages.ts";

// KV cache sync
import {
  syncPostCache,
  syncThemeCache,
  syncThemeStatusCacheByPostId,
} from "../../utils/kv-cache-sync.ts";
import {
  type ThemeCanonicalMeta,
  buildThemePathFromSlug,
  normalizeGitHubRef,
  normalizeSupports,
  normalizeThemeSubdir,
  normalizeThemeSlug,
  parseThemeImportState,
  isThemeActiveFlag,
  withThemeImportState,
  getThemeSnapshotById,
  validateThemeCanonicalMeta,
} from "../../core/services/theme-service.ts";
import { importThemeFromGitHub } from "../../core/services/theme-importer.ts";
import { syncSeoMetadataFromPostSave } from "../../core/services/seo-metadata-service.ts";
import { syncPostSearchIndex } from "../../core/services/search-service.ts";
import {
  persistMenuItems,
  type MenuItemFormRow,
} from "../../core/services/menu-items-service.ts";
import {
  adminUrlLocaleToDbCode,
  dbLocaleCodeToAdminUrl,
} from "../../utils/admin-locale-constants.ts";

// Auth
import { requireMinRole, resolveAuthorIdForRole } from "../../utils/api-auth.ts";
import {
  normalizeTranslationKey,
  TRANSLATION_KEY_META,
} from "../../core/services/post-translation-service.ts";

export const prerender = false;

function normalizeLocaleForAdminUrl(rawLocale: string): string {
  const value = String(rawLocale ?? "").trim();
  if (value === "pt_BR" || value === "es_ES" || value === "en_US") {
    return dbLocaleCodeToAdminUrl(value);
  }
  const lower = value.toLowerCase();
  if (lower === "pt-br" || lower === "es" || lower === "en") {
    return lower;
  }
  return "pt-br";
}

function normalizeLocaleForDbCode(rawLocale: string): string {
  const value = String(rawLocale ?? "").trim();
  if (value === "pt_BR" || value === "es_ES" || value === "en_US") {
    return value;
  }
  return adminUrlLocaleToDbCode(value);
}

/** Normaliza parent_id de hierarquia (não confundir com parent_id de attachments). */
async function resolveHierarchyParentId(
  rawParentId: number | null | undefined,
  currentPostId: number | null,
): Promise<number | null> {
  if (rawParentId == null || rawParentId <= 0) return null;
  if (currentPostId != null && rawParentId === currentPostId) return null;
  const exists = await postExists(db, rawParentId);
  return exists ? rawParentId : null;
}

/**
 * POST /api/posts
 * Cria ou atualiza um post
 *
 * @description
 * - Criação: action="new" sem id
 * - Edição: action="edit" com id
 * - Suporta post_type: post, page, attachment, etc.
 * - Gerencia taxonomias, meta_values e attachments
 *
 * @param {Request} request - Request com FormData contendo os dados do post
 * @returns {Promise<Response>} - Redirect para lista ou JSON com {id}
 *
 * @example FormData esperado:
 * - post_type: string (obrigatório)
 * - action: "new" | "edit" (obrigatório)
 * - id: number (obrigatório se action="edit")
 * - title: string (obrigatório)
 * - slug: string (obrigatório)
 * - status: "draft" | "published" | "archived"
 * - body: string
 * - excerpt: string
 * - author_id: string
 * - taxonomy_terms[]: number[]
 * - thumbnail_attachment_id: number
 * - blocknote_attachment_ids[]: number[]
 * - meta_*: campos customizados (ex: meta_custom_field)
 */
export async function POST({
  request,
  locals,
}: {
  request: Request;
  locals: App.Locals;
}): Promise<Response> {
  try {
    const authResult = await requireMinRole(request, 2, locals);
    if (authResult instanceof Response) return authResult;
    const { user: currentUser } = authResult;

    const formData = await request.formData();
    const isHtmx = request.headers.get("HX-Request") === "true";

    // Extrair dados básicos do formulário
    const post_type = getString(formData, "post_type");
    const action = getString(formData, "action");
    const postIdParam = getString(formData, "id") || null;
    const locale = getString(formData, "locale", "pt-br");
    const adminLocale = normalizeLocaleForAdminUrl(locale);
    const dbLocaleCodeFromLocale = normalizeLocaleForDbCode(locale);
    const title = getString(formData, "title");
    const slug = getString(formData, "slug");
    const excerpt = getString(formData, "excerpt", "");
    const body = getString(formData, "body", "");
    const status = normalizePostStatus(getString(formData, "status"));

    // Extrair author_id e aplicar regra de privilégio (autor só pode ser ele mesmo)
    const authorIdRaw = getString(formData, "author_id");
    const requestedAuthorId = authorIdRaw === "" ? null : authorIdRaw;
    const author_id = resolveAuthorIdForRole(
      requestedAuthorId,
      currentUser.id,
      currentUser.role ?? 3,
    );

    // Extrair IDs de taxonomias
    const termIds = getNumberArray(formData, "taxonomy_terms[]", true);

    // Extrair ID do thumbnail
    const thumbnailAttachmentId = getOptionalNumber(
      formData,
      "thumbnail_attachment_id",
    );

    // Extrair IDs de attachments do blocknote
    const blocknoteAttachmentIds = getNumberArray(
      formData,
      "blocknote_attachment_ids[]",
      true,
    );

    // parent_id do formulário: hierarquia do post (widget Pai no sidebar)
    const parentIdFromForm = getOptionalNumber(formData, "parent_id");

    // Extrair meta_values customizados
    const metaValues = getFieldsWithPrefix(formData, "meta_", true);
    const translationKeyRaw =
      metaValues[TRANSLATION_KEY_META] ?? getString(formData, "translation_key", "");
    const translationKey =
      normalizeTranslationKey(translationKeyRaw) ?? normalizeTranslationKey(slug);
    if (translationKey) {
      metaValues[TRANSLATION_KEY_META] = translationKey;
    } else {
      delete metaValues[TRANSLATION_KEY_META];
    }
    const customFieldsDataRaw = getString(formData, "custom_fields_data");
    const customFieldsToDeleteRaw = getString(formData, "custom_fields_to_delete");
    const menuItemsDataRaw = getString(formData, "menu_items_data");
    let themeCanonicalMeta: ThemeCanonicalMeta | null = null;
    let shouldQueueThemeImport = false;

    if (post_type === "themes") {
      const requestedActive = isThemeActiveFlag(metaValues["is_active"]);
      const existingThemeState =
        action === "edit" && postIdParam && parseNumericId(postIdParam)
          ? await getThemeSnapshotById(db, parseInt(postIdParam, 10))
          : null;
      const existingImportState = parseThemeImportState(
        existingThemeState?.meta_values ?? null
      );

      const canonicalMeta: ThemeCanonicalMeta = {
        theme_slug: normalizeThemeSlug(slug),
        theme_path: buildThemePathFromSlug(slug),
        supports: normalizeSupports(metaValues["supports"] ?? ""),
        ...(metaValues["github_repo_url"]?.trim()
          ? { github_repo_url: metaValues["github_repo_url"].trim() }
          : {}),
        ...(metaValues["github_ref"]?.trim()
          ? { github_ref: normalizeGitHubRef(metaValues["github_ref"]) }
          : {}),
        ...(metaValues["theme_subdir"]?.trim()
          ? { theme_subdir: normalizeThemeSubdir(metaValues["theme_subdir"]) }
          : {}),
        ...(metaValues["version"]?.trim()
          ? { version: metaValues["version"].trim() }
          : {}),
        ...(metaValues["author"]?.trim()
          ? { author: metaValues["author"].trim() }
          : {}),
        ...(metaValues["preview_image"]?.trim()
          ? { preview_image: metaValues["preview_image"].trim() }
          : {}),
      };
      const validation = validateThemeCanonicalMeta(canonicalMeta, {
        requireGithubRepoUrl: requestedActive,
      });
      if (!validation.valid) {
        const message = `Tema invalido: ${validation.errors.join("; ")}`;
        if (isHtmx) return badRequestHtmlResponse(message);
        return badRequestResponse(message, { theme: validation.errors });
      }

      themeCanonicalMeta = canonicalMeta;
      const isAlreadyActive =
        action === "edit" && existingImportState.is_active === true;
      shouldQueueThemeImport = requestedActive && !isAlreadyActive;

      if (post_type === "themes" && requestedActive && !shouldQueueThemeImport) {
        console.info(
          "[themes] import trigger skipped: theme already active",
          JSON.stringify({ theme_slug: slug, import_status: existingImportState.import_status })
        );
      }

      delete metaValues["is_active"];
      metaValues["requested_active"] = requestedActive ? "1" : "0";
      if (shouldQueueThemeImport) {
        metaValues["is_active"] = "0";
        metaValues["import_status"] = "importing";
        delete metaValues["import_error"];
      } else if (!requestedActive) {
        metaValues["is_active"] = "0";
        metaValues["import_status"] = "idle";
      } else {
        metaValues["is_active"] = "1";
        metaValues["import_status"] = "ready";
      }
    }

    // Extrair id_locale_code do formulário (se selecionado no dropdown)
    let localeId: number | null = getNumber(formData, "id_locale_code", null);
    if (localeId === null) {
      // Fallback: usar locale do formulário (normalizado para locale_code) quando
      // id_locale_code não vier explícito no payload.
      try {
        const [localeRow] = await db
          .select({ id: locales.id })
          .from(locales)
          .where(eq(locales.locale_code, dbLocaleCodeFromLocale))
          .limit(1);
        localeId = localeRow?.id ?? null;
      } catch {
        // Se não encontrar o locale, continua sem id_locale_code
        localeId = null;
      }
    }

    // Validar campos obrigatórios
    if (!post_type || !title || !slug) {
      const msg = getErrorMessage("MISSING_REQUIRED_FIELDS", adminLocale);
      if (isHtmx) return badRequestHtmlResponse(msg);
      const redirectUrl = buildAbsoluteUrl(
        request,
        buildContentUrl(
          adminLocale,
          post_type || "post",
          action,
          postIdParam || undefined,
        ),
      );
      return redirectResponse(redirectUrl);
    }

    // Validar formulário
    const validation = validatePostForm(formData);
    if (!validation.valid) {
      const msg = getErrorMessage("MISSING_REQUIRED_FIELDS", adminLocale);
      if (isHtmx) return badRequestHtmlResponse(msg);
      return badRequestResponse(msg, validation.errors);
    }

    // Segurança: edição sem ID válido nunca deve cair em criação.
    if (action === "edit" && (!postIdParam || !parseNumericId(postIdParam))) {
      const msg = "ID inválido para edição";
      if (isHtmx) return badRequestHtmlResponse(msg);
      return badRequestResponse(msg, { id: msg });
    }

    // Buscar ID do post_type
    const postTypeId = await getPostTypeId(db, post_type);
    if (!postTypeId) {
      const listUrl = buildAbsoluteUrl(request, buildListUrl(adminLocale, "post"));
      if (isHtmx) return htmxRedirectResponse(listUrl);
      return redirectResponse(listUrl);
    }

    const now = Date.now();
    let postId: number;

    // Processar criação ou edição
    if (action === "edit" && postIdParam && parseNumericId(postIdParam)) {
      // EDIÇÃO
      postId = parseInt(postIdParam, 10);
      const hierarchyParentId = await resolveHierarchyParentId(
        parentIdFromForm,
        postId,
      );

      // Preparar payload de atualização
      const updatePayload = {
        title,
        slug,
        excerpt: excerpt || null,
        body: body || null,
        status,
        author_id,
        id_locale_code: localeId,
        parent_id: hierarchyParentId,
        updated_at: now,
      };

      // Atualizar post
      await updatePost(db, postId, postTypeId, updatePayload);

      // Atualizar meta_values preservando valores existentes
      const metaToUpdate: Record<string, string> = { ...metaValues };

      // Atualizar ou remover post_thumbnail_id baseado em thumbnailAttachmentId
      if (thumbnailAttachmentId !== undefined) {
        if (thumbnailAttachmentId !== null && thumbnailAttachmentId > 0) {
          metaToUpdate["post_thumbnail_id"] = String(thumbnailAttachmentId);
        } else {
          // Se foi enviado mas é null, queremos remover o thumbnail
          // updatePostMetaValues não tem suporte para deletar, então vamos buscar e mesclar manualmente
          const [existing] = await db
            .select({
              meta_values: (await import("../../db/schema.ts")).posts
                .meta_values,
            })
            .from((await import("../../db/schema.ts")).posts)
            .where(
              (await import("drizzle-orm")).and(
                (await import("drizzle-orm")).eq(
                  (await import("../../db/schema.ts")).posts.id,
                  postId,
                ),
                (await import("drizzle-orm")).eq(
                  (await import("../../db/schema.ts")).posts.post_type_id,
                  postTypeId,
                ),
              ),
            )
            .limit(1);

          let merged: Record<string, string> = {};
          if (existing?.meta_values) {
            try {
              merged = {
                ...(JSON.parse(existing.meta_values) as Record<string, string>),
              };
            } catch {
              merged = {};
            }
          }

          // Mesclar novos valores
          merged = { ...merged, ...metaToUpdate };

          // Remover post_thumbnail_id
          delete merged["post_thumbnail_id"];

          // Atualizar diretamente
          await updatePost(db, postId, postTypeId, {
            meta_values:
              Object.keys(merged).length > 0 ? JSON.stringify(merged) : null,
            updated_at: now,
          });
        }
      } else {
        // Se thumbnail_attachment_id não foi enviado, apenas atualizar outros meta_values
        if (Object.keys(metaToUpdate).length > 0) {
          await updatePostMetaValues(db, postId, postTypeId, metaToUpdate);
        }
      }

      // Se thumbnailAttachmentId foi definido e não é null, atualizar meta_values com merge
      if (
        thumbnailAttachmentId !== undefined &&
        thumbnailAttachmentId !== null
      ) {
        await updatePostMetaValues(db, postId, postTypeId, metaToUpdate);
      }
    } else {
      // CRIAÇÃO
      const hierarchyParentId = await resolveHierarchyParentId(
        parentIdFromForm,
        null,
      );
      const finalMetaValues: Record<string, string> = { ...metaValues };

      // Adicionar post_thumbnail_id se existir
      if (
        thumbnailAttachmentId !== undefined &&
        thumbnailAttachmentId !== null &&
        thumbnailAttachmentId > 0
      ) {
        finalMetaValues["post_thumbnail_id"] = String(thumbnailAttachmentId);
      }

      const createPayload = {
        post_type_id: postTypeId,
        parent_id: hierarchyParentId,
        title,
        slug,
        excerpt: excerpt || null,
        body: body || null,
        status,
        author_id,
        id_locale_code: localeId,
        meta_values: stringifyMetaValues(finalMetaValues),
        created_at: now,
        updated_at: now,
      };

      postId = await createPost(db, createPayload);
    }

    // Vincular taxonomias
    if (postId && termIds.length > 0) {
      await linkPostTaxonomies(db, postId, termIds);
    }

    // Processar e vincular attachments
    if (postId) {
      await processPostAttachments(
        db,
        postId,
        thumbnailAttachmentId !== undefined ? thumbnailAttachmentId : undefined,
        blocknoteAttachmentIds,
      );

      // Atualizar parent_id e id_locale_code dos attachments relacionados ao post
      // Isso garante que attachments criados durante a criação/edição tenham os campos corretos
      const attachmentTypeId = await getPostTypeId(db, "attachment");
      if (attachmentTypeId) {
        const { posts: postsTable } = await import("../../db/schema.ts");
        const { eq, and, inArray } = await import("drizzle-orm");

        // Coletar todos os IDs de attachments relacionados ao post
        const attachmentIds: number[] = [];
        if (thumbnailAttachmentId && thumbnailAttachmentId > 0) {
          attachmentIds.push(thumbnailAttachmentId);
        }
        attachmentIds.push(...blocknoteAttachmentIds);

        // Atualizar parent_id e id_locale_code dos attachments relacionados
        if (attachmentIds.length > 0) {
          await db
            .update(postsTable)
            .set({
              parent_id: postId,
              id_locale_code: localeId,
            })
            .where(
              and(
                eq(postsTable.post_type_id, attachmentTypeId),
                inArray(postsTable.id, attachmentIds),
              ),
            );
        }
      }
    }

    // Processar custom fields: deletar os marcados e criar/atualizar os restantes

    if (postId) {
      const customFieldsTypeId = await getPostTypeId(db, "custom_fields");
      if (customFieldsTypeId) {
        const { posts: postsTable } = await import("../../db/schema.ts");
        const { eq, and, inArray } = await import("drizzle-orm");

        // Deletar custom fields explicitamente marcados para deleção
        if (customFieldsToDeleteRaw !== "") {
          try {
            const idsToDelete = JSON.parse(customFieldsToDeleteRaw) as number[];
            if (Array.isArray(idsToDelete) && idsToDelete.length > 0) {
              await db
                .delete(postsTable)
                .where(
                  and(
                    eq(postsTable.parent_id, postId),
                    eq(postsTable.post_type_id, customFieldsTypeId),
                    inArray(postsTable.id, idsToDelete),
                  ),
                );
            }
          } catch {
            // Ignorar erro de parse
          }
        }

        // Criar/atualizar custom fields restantes
        if (customFieldsDataRaw !== "") {
          try {
            const customFieldsItems = JSON.parse(customFieldsDataRaw) as Array<{
              id?: number;
              title: string;
              rows: Array<{ id?: number; name?: string; value: string; type?: string }>;
              template?: boolean;
            }>;
            if (
              Array.isArray(customFieldsItems) &&
              customFieldsItems.length > 0
            ) {
              // Deletar todos os custom fields filhos existentes para recriar a partir do formulário
              // (isso garante que campos removidos do formulário sejam deletados)
              await db
                .delete(postsTable)
                .where(
                  and(
                    eq(postsTable.parent_id, postId),
                    eq(postsTable.post_type_id, customFieldsTypeId),
                  ),
                );

              // Criar os custom fields do formulário (slug único com incremental para evitar UNIQUE constraint)
              for (let i = 0; i < customFieldsItems.length; i++) {
                const item = customFieldsItems[i];
                const baseSlug = slugify(item.title) || "custom-field";
                const slug = `${baseSlug}-${postId}-${i + 1}`;
                const template = item.template === true;
                const rows = item.rows ?? [];
                const fieldTypeSet = new Set<string>();
                rows.forEach((r) => {
                  if (r.type === "file") {
                    fieldTypeSet.add("upload");
                  } else if (r.type === "editor") {
                    fieldTypeSet.add("editor");
                  } else {
                    fieldTypeSet.add("text");
                  }
                });
                const field_type = Array.from(fieldTypeSet);
                const metaValuesStr =
                  rows.length > 0
                    ? JSON.stringify({
                        fields: rows.map((r) => ({
                          name: r.name ?? "",
                          value: r.value ?? "",
                          type: r.type === "file" ? "file" : r.type === "editor" ? "editor" : "text",
                        })),
                        template,
                        field_type,
                      })
                    : JSON.stringify({ template, field_type });
                await createPost(db, {
                  post_type_id: customFieldsTypeId,
                  parent_id: postId,
                  title: (item.title || "").trim() || "Custom field",
                  slug,
                  status,
                  author_id,
                  id_locale_code: localeId,
                  meta_values: metaValuesStr,
                  created_at: now,
                  updated_at: now,
                });
              }

              if (post_type === "jobs") {
                await applyJobsCustomFieldsToMeta(
                  db,
                  postId,
                  postTypeId,
                  customFieldsItems,
                );
              } else if (await postHasDiretoresCategory(db, postId)) {
                await applyDiretoresCustomFieldsToMeta(
                  db,
                  postId,
                  postTypeId,
                  customFieldsItems,
                );
              }
            }
          } catch {
            // Ignorar erro de parse ou criação de custom fields
          }
        }
      }
    }

    let menuChildIds: number[] = [];
    if (postId && post_type === "menus") {
      const menusTypeId = postTypeId;
      let menuItems: MenuItemFormRow[] = [];
      if (menuItemsDataRaw !== "") {
        try {
          const parsed = JSON.parse(menuItemsDataRaw) as MenuItemFormRow[];
          if (Array.isArray(parsed)) {
            menuItems = parsed;
          }
        } catch {
          // ignore parse errors
        }
      }
      menuChildIds = await persistMenuItems(db, {
        menuPostId: postId,
        menusTypeId,
        items: menuItems,
        parentLocaleId: localeId,
        status,
        author_id,
        now,
      });
    }

    if (postId && post_type !== "custom_fields") {
      await syncSeoMetadataFromPostSave(db, postId, {
        title,
        excerpt: excerpt || "",
        slug,
      }, customFieldsDataRaw);
    }

    // Atualizar cache KV com o post atual (create ou update)
    for (const childId of menuChildIds) {
      await syncPostCache(locals, db, childId);
    }
    await syncPostCache(locals, db, postId);
    if (postId) {
      await syncPostSearchIndex(db, postId);
    }
    if (post_type === "themes") {
      await syncThemeStatusCacheByPostId(locals, db, postId);
      await syncThemeCache(locals, db);
    }

    if (post_type === "themes" && shouldQueueThemeImport && !themeCanonicalMeta?.github_repo_url) {
      console.warn(
        "[themes] import trigger skipped: github_repo_url not set",
        JSON.stringify({ theme_slug: slug, postId })
      );
    }

    if (
      post_type === "themes" &&
      shouldQueueThemeImport &&
      postId &&
      themeCanonicalMeta?.github_repo_url
    ) {
      console.info(
        "[themes] queuing import",
        JSON.stringify({ theme_slug: slug, repo_url: themeCanonicalMeta.github_repo_url, ref: themeCanonicalMeta.github_ref ?? "main" })
      );
      const handleImportError = async (err: unknown) => {
        console.error("[themes] import failed", err);
        try {
          const snapshot = await getThemeSnapshotById(db, postId);
          if (!snapshot) return;
          const failedMeta = withThemeImportState(snapshot.meta_values, {
            requested_active: false,
            is_active: false,
            import_status: "failed",
            import_error:
              err instanceof Error ? err.message : "Erro ao importar tema",
          });
          await updatePost(db, postId, postTypeId, {
            meta_values: failedMeta,
            updated_at: Date.now(),
          });
          await syncThemeStatusCacheByPostId(locals, db, postId);
          await syncThemeCache(locals, db);
        } catch {
          // ignora erros do fallback
        }
      };

      // Em Workers de produção usa waitUntil do runtime Cloudflare (ctx) para não
      // bloquear o response; em dev (Vite/Astro sem runtime real) await diretamente
      // para garantir que o import não seja descartado antes de completar.
      const importPromise = importThemeFromGitHub(locals, {
        themePostId: postId,
        themeSlug: slug,
        repoUrl: themeCanonicalMeta.github_repo_url,
        ref: themeCanonicalMeta.github_ref ?? "main",
        subdir: themeCanonicalMeta.theme_subdir ?? "",
      }).catch(handleImportError);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfCtx = (locals as any)?.cfContext;
      if (typeof cfCtx?.waitUntil === "function") {
        cfCtx.waitUntil(importPromise);
      } else {
        await importPromise;
      }
    }

    // Retornar resposta
    const listUrl = buildAbsoluteUrl(request, buildListUrl(adminLocale, post_type));
    const acceptsJson = request.headers
      .get("Accept")
      ?.includes("application/json");
    if (acceptsJson) return jsonResponse({ id: postId });
    if (isHtmx) return htmxRedirectResponse(listUrl);
    return redirectResponse(listUrl);
  } catch (err) {
    return handleApiError(err, "POST /api/posts");
  }
}
