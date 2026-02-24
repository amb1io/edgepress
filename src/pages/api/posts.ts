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

// KV cache sync
import { syncPostCache } from "../../lib/kv-cache-sync.ts";

// Auth
import { requireMinRole, resolveAuthorIdForRole } from "../../lib/api-auth.ts";

export const prerender = false;

/**
 * POST /api/posts
 * Creates or updates a post
 *
 * @description
 * - Create: action="new" without id
 * - Edit: action="edit" with id
 * - Supports post_type: post, page, attachment, etc.
 * - Manages taxonomies, meta_values and attachments
 *
 * @param {Request} request - Request with FormData containing post data
 * @returns {Promise<Response>} - Redirect to list or JSON with {id}
 *
 * @example Expected FormData:
 * - post_type: string (required)
 * - action: "new" | "edit" (required)
 * - id: number (required if action="edit")
 * - title: string (required)
 * - slug: string (required)
 * - status: "draft" | "published" | "archived"
 * - body: string
 * - excerpt: string
 * - author_id: string
 * - taxonomy_terms[]: number[]
 * - thumbnail_attachment_id: number
 * - blocknote_attachment_ids[]: number[]
 * - meta_*: custom fields (e.g. meta_custom_field)
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

    // Extract basic form data
    const post_type = getString(formData, "post_type");
    const action = getString(formData, "action");
    const postIdParam = getString(formData, "id") || null;
    const locale = getString(formData, "locale", "pt-br");
    const title = getString(formData, "title");
    const slug = getString(formData, "slug");
    const excerpt = getString(formData, "excerpt", "");
    const body = getString(formData, "body", "");
    const status = normalizePostStatus(getString(formData, "status"));

    // Extract author_id and apply privilege rule (author can only be themselves)
    const authorIdRaw = getString(formData, "author_id");
    const requestedAuthorId = authorIdRaw === "" ? null : authorIdRaw;
    const author_id = resolveAuthorIdForRole(
      requestedAuthorId,
      currentUser.id,
      currentUser.role ?? 3,
    );

    // Extract taxonomy IDs
    const termIds = getNumberArray(formData, "taxonomy_terms[]", true);

    // Extract thumbnail ID
    const thumbnailAttachmentId = getOptionalNumber(
      formData,
      "thumbnail_attachment_id",
    );

    // Extract blocknote attachment IDs
    const blocknoteAttachmentIds = getNumberArray(
      formData,
      "blocknote_attachment_ids[]",
      true,
    );

    // Extract parent_id (used when creating child attachments)
    const parentId = getOptionalNumber(formData, "parent_id");

    // Extract custom meta_values
    const metaValues = getFieldsWithPrefix(formData, "meta_", true);

    // Extract id_locale_code from the form (if selected in the dropdown)
    let localeId: number | null = getNumber(formData, "id_locale_code", null);
    if (localeId === null) {
      // Fallback: use URL locale if there is no id_locale_code in the form
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
        // If the locale is not found, continue without id_locale_code
        localeId = null;
      }
    }

    // Validate required fields
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

    // Validate form
    const validation = validatePostForm(formData);
    if (!validation.valid) {
      const msg = getErrorMessage("MISSING_REQUIRED_FIELDS", locale);
      if (isHtmx) return badRequestHtmlResponse(msg);
      return badRequestResponse(msg, validation.errors);
    }

    // Fetch post_type ID
    const postTypeId = await getPostTypeId(db, post_type);
    if (!postTypeId) {
      const listUrl = buildAbsoluteUrl(request, buildListUrl(locale, "post"));
      if (isHtmx) return htmxRedirectResponse(listUrl);
      return redirectResponse(listUrl);
    }

    const now = Date.now();
    let postId: number;

    // Process create or edit
    if (action === "edit" && postIdParam && parseNumericId(postIdParam)) {
      // EDIT
      postId = parseInt(postIdParam, 10);

      // Prepare update payload
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

      // Update post
      await updatePost(db, postId, postTypeId, updatePayload);

      // Update meta_values while preserving existing values
      const metaToUpdate: Record<string, string> = { ...metaValues };

      // Update or remove post_thumbnail_id based on thumbnailAttachmentId
      if (thumbnailAttachmentId !== undefined) {
        if (thumbnailAttachmentId !== null && thumbnailAttachmentId > 0) {
          metaToUpdate["post_thumbnail_id"] = String(thumbnailAttachmentId);
        } else {
          // If it was sent but is null, we want to remove the thumbnail
          // updatePostMetaValues does not support deletion, so we fetch and merge manually
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

          // Merge new values
          merged = { ...merged, ...metaToUpdate };

          // Remove post_thumbnail_id
          delete merged["post_thumbnail_id"];

          // Update directly
          await updatePost(db, postId, postTypeId, {
            meta_values:
              Object.keys(merged).length > 0 ? JSON.stringify(merged) : null,
            updated_at: now,
          });
        }
      } else {
        // If thumbnail_attachment_id was not sent, only update other meta_values
        if (Object.keys(metaToUpdate).length > 0) {
          await updatePostMetaValues(db, postId, postTypeId, metaToUpdate);
        }
      }

      // If thumbnailAttachmentId is defined and not null, update meta_values with merge
      if (
        thumbnailAttachmentId !== undefined &&
        thumbnailAttachmentId !== null
      ) {
        await updatePostMetaValues(db, postId, postTypeId, metaToUpdate);
      }
    } else {
      // CREATE
      const finalMetaValues: Record<string, string> = { ...metaValues };

      // Add post_thumbnail_id if present
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

    // Link taxonomies
    if (postId && termIds.length > 0) {
      await linkPostTaxonomies(db, postId, termIds);
    }

    // Process and link attachments
    if (postId) {
      await processPostAttachments(
        db,
        postId,
        thumbnailAttachmentId !== undefined ? thumbnailAttachmentId : undefined,
        blocknoteAttachmentIds,
      );

      // Update parent_id and id_locale_code of attachments related to the post
      // This ensures attachments created during create/edit have the correct fields
      const attachmentTypeId = await getPostTypeId(db, "attachment");
      if (attachmentTypeId) {
        const { posts: postsTable } = await import("../../db/schema.ts");
        const { eq, and, inArray } = await import("drizzle-orm");

        // Collect all attachment IDs related to the post
        const attachmentIds: number[] = [];
        if (thumbnailAttachmentId && thumbnailAttachmentId > 0) {
          attachmentIds.push(thumbnailAttachmentId);
        }
        attachmentIds.push(...blocknoteAttachmentIds);

        // Update parent_id and id_locale_code of related attachments
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

    // Process custom fields: delete the ones marked and create/update the rest
    const customFieldsToDeleteRaw = getString(formData, "custom_fields_to_delete");
    const customFieldsDataRaw = getString(formData, "custom_fields_data");

    if (postId) {
      const customFieldsTypeId = await getPostTypeId(db, "custom_fields");
      if (customFieldsTypeId) {
        const { posts: postsTable } = await import("../../db/schema.ts");
        const { eq, and, inArray } = await import("drizzle-orm");

        // Delete custom fields explicitly marked for deletion
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
            // Ignore parse error
          }
        }

        // Create/update remaining custom fields
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
              // Delete all existing child custom fields to recreate from the form
              // (this ensures fields removed from the form are deleted)
              await db
                .delete(postsTable)
                .where(
                  and(
                    eq(postsTable.parent_id, postId),
                    eq(postsTable.post_type_id, customFieldsTypeId),
                  ),
                );

              // Create custom fields from the form (unique slug with incremental to avoid UNIQUE constraint)
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
            // Ignore parse or custom field creation error
          }
        }
      }
    }

    // Update KV cache with the current post (create or update)
    await syncPostCache(locals, db, postId);

    // Return response
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
