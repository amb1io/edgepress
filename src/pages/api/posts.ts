// Database
import { db } from "../../db/index.ts";

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
  getNumberArray,
  getOptionalNumber,
  getString,
} from "../../lib/utils/form-data.ts";

// Utils - Validation & Parsing
import { normalizePostStatus, parseNumericId } from "../../lib/utils/validation.ts";
import { stringifyMetaValues } from "../../lib/utils/meta-parser.ts";

// Utils - HTTP & Errors
import { handleApiError } from "../../lib/utils/error-handler.ts";
import { badRequestResponse, jsonResponse, redirectResponse } from "../../lib/utils/http-responses.ts";

// Utils - URLs
import { buildAbsoluteUrl, buildContentUrl, buildListUrl } from "../../lib/utils/url.ts";

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
    const authorIdRaw = formData.get("author_id");
    const requestedAuthorId =
      typeof authorIdRaw === "string" && authorIdRaw.trim() ? authorIdRaw.trim() : null;
    const author_id = resolveAuthorIdForRole(
      requestedAuthorId,
      currentUser.id,
      currentUser.role ?? 3
    );
    
    // Extrair IDs de taxonomias
    const termIds = getNumberArray(formData, "taxonomy_terms[]", true);
    
    // Extrair ID do thumbnail
    const thumbnailAttachmentId = getOptionalNumber(formData, "thumbnail_attachment_id");
    
    // Extrair IDs de attachments do blocknote
    const blocknoteAttachmentIds = getNumberArray(formData, "blocknote_attachment_ids[]", true);
    
    // Extrair meta_values customizados
    const metaValues = getFieldsWithPrefix(formData, "meta_", true);
    
    // Validar campos obrigatórios
    if (!post_type || !title || !slug) {
      const redirectUrl = buildAbsoluteUrl(
        request,
        buildContentUrl(locale, post_type || "post", action, postIdParam || undefined)
      );
      return redirectResponse(redirectUrl);
    }
    
    // Validar formulário
    const validation = validatePostForm(formData);
    if (!validation.valid) {
      return badRequestResponse(
        getErrorMessage("MISSING_REQUIRED_FIELDS", locale),
        validation.errors
      );
    }
    
    // Buscar ID do post_type
    const postTypeId = await getPostTypeId(db, post_type);
    if (!postTypeId) {
      const redirectUrl = buildAbsoluteUrl(request, buildListUrl(locale, "post"));
      return redirectResponse(redirectUrl);
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
            .select({ meta_values: (await import("../../db/schema.ts")).posts.meta_values })
            .from((await import("../../db/schema.ts")).posts)
            .where((await import("drizzle-orm")).and(
              (await import("drizzle-orm")).eq((await import("../../db/schema.ts")).posts.id, postId),
              (await import("drizzle-orm")).eq((await import("../../db/schema.ts")).posts.post_type_id, postTypeId)
            ))
            .limit(1);
          
          let merged: Record<string, string> = {};
          if (existing?.meta_values) {
            try {
              merged = { ...JSON.parse(existing.meta_values) as Record<string, string> };
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
            meta_values: Object.keys(merged).length > 0 ? JSON.stringify(merged) : null,
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
      if (thumbnailAttachmentId !== undefined && thumbnailAttachmentId !== null) {
        await updatePostMetaValues(db, postId, postTypeId, metaToUpdate);
      }
    } else {
      // CRIAÇÃO
      const finalMetaValues: Record<string, string> = { ...metaValues };
      
      // Adicionar post_thumbnail_id se existir
      if (thumbnailAttachmentId !== undefined && thumbnailAttachmentId !== null && thumbnailAttachmentId > 0) {
        finalMetaValues["post_thumbnail_id"] = String(thumbnailAttachmentId);
      }
      
      const createPayload = {
        post_type_id: postTypeId,
        title,
        slug,
        excerpt: excerpt || null,
        body: body || null,
        status,
        author_id,
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
        blocknoteAttachmentIds
      );
    }

    // Processar custom fields: deletar os marcados e criar/atualizar os restantes
    const customFieldsToDeleteRaw = formData.get("custom_fields_to_delete");
    const customFieldsDataRaw = formData.get("custom_fields_data");
    
    if (postId) {
      const customFieldsTypeId = await getPostTypeId(db, "custom_fields");
      if (customFieldsTypeId) {
        const { posts: postsTable } = await import("../../db/schema.ts");
        const { eq, and, inArray } = await import("drizzle-orm");
        
        // Deletar custom fields explicitamente marcados para deleção
        if (customFieldsToDeleteRaw && typeof customFieldsToDeleteRaw === "string" && customFieldsToDeleteRaw.trim()) {
          try {
            const idsToDelete = JSON.parse(customFieldsToDeleteRaw) as number[];
            if (Array.isArray(idsToDelete) && idsToDelete.length > 0) {
              await db
                .delete(postsTable)
                .where(
                  and(
                    eq(postsTable.parent_id, postId),
                    eq(postsTable.post_type_id, customFieldsTypeId),
                    inArray(postsTable.id, idsToDelete)
                  )
                );
            }
          } catch {
            // Ignorar erro de parse
          }
        }
        
        // Criar/atualizar custom fields restantes
        if (customFieldsDataRaw && typeof customFieldsDataRaw === "string" && customFieldsDataRaw.trim()) {
          try {
            const customFieldsItems = JSON.parse(customFieldsDataRaw) as Array<{
              id?: number;
              title: string;
              rows: Array<{ id?: number; name?: string; value: string }>;
            }>;
            if (Array.isArray(customFieldsItems) && customFieldsItems.length > 0) {
              // Deletar todos os custom fields filhos existentes para recriar a partir do formulário
              // (isso garante que campos removidos do formulário sejam deletados)
              await db
                .delete(postsTable)
                .where(
                  and(
                    eq(postsTable.parent_id, postId),
                    eq(postsTable.post_type_id, customFieldsTypeId)
                  )
                );
              
              // Criar os custom fields do formulário
              for (const item of customFieldsItems) {
                const slug = slugify(item.title) || "custom-field";
                const metaValuesStr =
                  item.rows?.length > 0
                    ? JSON.stringify({ fields: item.rows.map((r) => ({ name: r.name ?? "", value: r.value ?? "" })) })
                    : null;
                await createPost(db, {
                  post_type_id: customFieldsTypeId,
                  parent_id: postId,
                  title: (item.title || "").trim() || "Custom field",
                  slug,
                  status,
                  author_id,
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
    const acceptsJson = request.headers.get("Accept")?.includes("application/json");
    if (acceptsJson) {
      return jsonResponse({ id: postId });
    }
    
    const listUrl = buildAbsoluteUrl(request, buildListUrl(locale, post_type));
    return redirectResponse(listUrl);
  } catch (err) {
    return handleApiError(err, "POST /api/posts");
  }
}
