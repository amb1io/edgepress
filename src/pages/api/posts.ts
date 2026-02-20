// Database
import { db } from "../../db/index.ts";
import { locales } from "../../db/schema.ts";
import { eq } from "drizzle-orm";

// Services
import {
  createPost,
  getPostTypeId,
  linkPostTaxonomies,
  processPostAttachments,
  updatePost,
  updatePostMetaValues,
} from "../../lib/services/post-service.ts";

// Validators
import { validatePostForm } from "../../lib/validators/post-validator.ts";

// Utils - Form Data
import {
  getFieldsWithPrefix,
  getNumber,
  getNumberArray,
  getOptionalNumber,
  getString,
} from "../../lib/utils/form-data.ts";

// Utils - Validation & Parsing
import {
  normalizePostStatus,
  parseNumericId,
} from "../../lib/utils/validation.ts";
import { stringifyMetaValues } from "../../lib/utils/meta-parser.ts";

// Utils - HTTP & Errors
import { handleApiError } from "../../lib/utils/error-handler.ts";
import {
  badRequestResponse,
  badRequestHtmlResponse,
  jsonResponse,
  redirectResponse,
  htmxRedirectResponse,
} from "../../lib/utils/http-responses.ts";

// Utils - URLs
import {
  buildAbsoluteUrl,
  buildContentUrl,
  buildListUrl,
} from "../../lib/utils/url.ts";

// Utils - Slug
import { slugify } from "../../lib/slugify.ts";

// Constants
import { getErrorMessage } from "../../lib/constants/error-messages.ts";

// Auth
import { requireMinRole, resolveAuthorIdForRole } from "../../lib/api-auth.ts";

export const prerender = false;

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

    // Extrair parent_id (usado quando criar attachments filhos)
    const parentId = getOptionalNumber(formData, "parent_id");

    // Extrair meta_values customizados
    const metaValues = getFieldsWithPrefix(formData, "meta_", true);

    // Extrair id_locale_code do formulário (se selecionado no dropdown)
    let localeId: number | null = getNumber(formData, "id_locale_code", null);
    if (localeId === null) {
      // Fallback: usar locale da URL se não houver id_locale_code no formulário
      const LOCALE_MAP: Record<string, string> = {
        en: "en_US",
        "en-US": "en_US",
        en_US: "en_US",
        es: "es_ES",
        "es-ES": "es_ES",
        es_ES: "es_ES",
        "pt-br": "pt_BR",
        pt_BR: "pt_BR",
        "pt-BR": "pt_BR",
      };
      const normalizedLocale = locale.toLowerCase().replace(/-/g, "_");
      const dbLocaleCode =
        LOCALE_MAP[normalizedLocale] || LOCALE_MAP[locale] || locale;

      try {
        const [localeRow] = await db
          .select({ id: locales.id })
          .from(locales)
          .where(eq(locales.locale_code, dbLocaleCode))
          .limit(1);
        localeId = localeRow?.id ?? null;
      } catch {
        // Se não encontrar o locale, continua sem id_locale_code
        localeId = null;
      }
    }

    // Validar campos obrigatórios
    if (!post_type || !title || !slug) {
      const msg = getErrorMessage("MISSING_REQUIRED_FIELDS", locale);
      if (isHtmx) return badRequestHtmlResponse(msg);
      const redirectUrl = buildAbsoluteUrl(
        request,
        buildContentUrl(
          locale,
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
      const msg = getErrorMessage("MISSING_REQUIRED_FIELDS", locale);
      if (isHtmx) return badRequestHtmlResponse(msg);
      return badRequestResponse(msg, validation.errors);
    }

    // Buscar ID do post_type
    const postTypeId = await getPostTypeId(db, post_type);
    if (!postTypeId) {
      const listUrl = buildAbsoluteUrl(request, buildListUrl(locale, "post"));
      if (isHtmx) return htmxRedirectResponse(listUrl);
      return redirectResponse(listUrl);
    }

    const now = Date.now();
    let postId: number;

    // Processar criação ou edição
    if (action === "edit" && postIdParam && parseNumericId(postIdParam)) {
      // EDIÇÃO
      postId = parseInt(postIdParam, 10);

      // Preparar payload de atualização
      const updatePayload = {
        title,
        slug,
        excerpt: excerpt || null,
        body: body || null,
        status,
        author_id,
        id_locale_code: localeId,
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
        parent_id: parentId !== undefined ? parentId : null,
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
    const customFieldsToDeleteRaw = getString(formData, "custom_fields_to_delete");
    const customFieldsDataRaw = getString(formData, "custom_fields_data");

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
            }
          } catch {
            // Ignorar erro de parse ou criação de custom fields
          }
        }
      }
    }

    // Retornar resposta
    const listUrl = buildAbsoluteUrl(request, buildListUrl(locale, post_type));
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
