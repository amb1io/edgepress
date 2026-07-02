import type { APIRoute } from "astro";
import { db } from "../../../../db/index.ts";
import { posts, postsMedia, postsTaxonomies, postTypes } from "../../../../db/schema.ts";
import { eq, and } from "drizzle-orm";
import { requireMinRole } from "../../../../utils/api-auth.ts";
import { getPostTypeId } from "../../../../core/services/post-service.ts";
import { htmxRedirectResponse } from "../../../../utils/http-responses.ts";
import { parseMetaValues, stringifyMetaValues } from "../../../../utils/meta-parser.ts";
import {
  normalizeTranslationKey,
  TRANSLATION_KEY_META,
} from "../../../../core/services/post-translation-service.ts";
import {
  customFieldPostsToItems,
  extractSeoFromCustomFields,
  resolveSeoValues,
  upsertSeoMetadata,
} from "../../../../core/services/seo-metadata-service.ts";

export const prerender = false;

/** Meta: ID do post de origem ao criar tradução via "Adicionar Tradução". */
export const ORIGINAL_POST_META = "original_post";

function resolveOriginalPostIdForDuplicate(
  meta: Record<string, unknown>,
  sourcePostId: number,
): number {
  const raw = meta[ORIGINAL_POST_META];
  const fromMeta =
    typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : NaN;
  if (Number.isInteger(fromMeta) && fromMeta > 0) return fromMeta;
  return sourcePostId;
}

/**
 * POST /api/posts/[id]/duplicate-translation
 * Duplica o post para uma nova versão de idioma: mantém translation_key, define parent_id no canônico.
 */
export const POST: APIRoute = async ({ params, request, url, locals }) => {
  const authResult = await requireMinRole(request, 2, locals);
  if (authResult instanceof Response) return authResult;

  const id = params?.id;
  if (!id || !/^\d+$/.test(id)) {
    return new Response(JSON.stringify({ success: false, error: "Bad Request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const postId = parseInt(id, 10);
  const adminLocale =
    url.searchParams.get("admin_locale")?.trim() ||
    request.headers.get("Referer")?.match(/\/admin\/([^/]+)\//)?.[1] ||
    "pt-br";

  try {
    const [originalPost] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);

    if (!originalPost) {
      return new Response(JSON.stringify({ success: false, error: "Post not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [postTypeRow] = await db
      .select({ slug: postTypes.slug })
      .from(postTypes)
      .where(eq(postTypes.id, originalPost.post_type_id))
      .limit(1);
    const postTypeSlug = postTypeRow?.slug ?? "post";

    const taxonomyRelations = await db
      .select({ term_id: postsTaxonomies.term_id })
      .from(postsTaxonomies)
      .where(eq(postsTaxonomies.post_id, postId));

    const mediaRelations = await db
      .select({ media_id: postsMedia.media_id })
      .from(postsMedia)
      .where(eq(postsMedia.post_id, postId));

    const customFieldsTypeId = await getPostTypeId(db, "custom_fields");
    const customFieldsPosts = customFieldsTypeId
      ? await db
          .select()
          .from(posts)
          .where(and(eq(posts.parent_id, postId), eq(posts.post_type_id, customFieldsTypeId)))
      : [];

    const baseTitle = originalPost.title;
    const baseSlug = originalPost.slug;
    let newTitle = baseTitle;
    let newSlug = baseSlug;
    let counter = 1;
    let slugExists = true;

    while (slugExists) {
      newTitle = `${baseTitle} ${counter}`;
      newSlug = `${baseSlug}-${counter}`;
      const [existingSlug] = await db
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.slug, newSlug))
        .limit(1);
      slugExists = !!existingSlug;
      if (slugExists) counter++;
    }

    const parsedMeta = parseMetaValues(originalPost.meta_values) as Record<string, unknown>;
    const translationKey =
      normalizeTranslationKey(
        typeof parsedMeta[TRANSLATION_KEY_META] === "string"
          ? parsedMeta[TRANSLATION_KEY_META]
          : null,
      ) ?? normalizeTranslationKey(originalPost.slug);
    const originalPostMetaId = resolveOriginalPostIdForDuplicate(parsedMeta, postId);

    const metaForCopy: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsedMeta)) {
      if (v != null && typeof v !== "object" && k !== ORIGINAL_POST_META) {
        metaForCopy[k] = String(v);
      }
    }
    if (translationKey) {
      metaForCopy[TRANSLATION_KEY_META] = translationKey;
    }
    metaForCopy[ORIGINAL_POST_META] = String(originalPostMetaId);

    const canonicalParentId = originalPost.parent_id ?? originalPost.id;
    const now = Date.now();

    const [newPost] = await db
      .insert(posts)
      .values({
        post_type_id: originalPost.post_type_id,
        parent_id: canonicalParentId,
        author_id: originalPost.author_id,
        id_locale_code: null,
        title: newTitle,
        slug: newSlug,
        excerpt: originalPost.excerpt,
        body: originalPost.body,
        body_blocks: originalPost.body_blocks,
        status: "draft",
        meta_values: stringifyMetaValues(metaForCopy),
        published_at: null,
        created_at: now,
        updated_at: now,
      })
      .returning({ id: posts.id });

    if (!newPost?.id) {
      return new Response(JSON.stringify({ success: false, error: "Failed to create duplicate" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const newPostId = newPost.id;

    if (taxonomyRelations.length > 0) {
      await db.insert(postsTaxonomies).values(
        taxonomyRelations.map((rel) => ({ post_id: newPostId, term_id: rel.term_id })),
      );
    }

    if (mediaRelations.length > 0) {
      await db.insert(postsMedia).values(
        mediaRelations.map((rel) => ({ post_id: newPostId, media_id: rel.media_id })),
      );
    }

    if (customFieldsPosts.length > 0 && customFieldsTypeId) {
      const customFieldsToInsert = [];
      for (const cfPost of customFieldsPosts) {
        let cfSlug = `${cfPost.slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let cfSlugExists = true;
        let cfCounter = 1;
        while (cfSlugExists) {
          const [existingCfSlug] = await db
            .select({ id: posts.id })
            .from(posts)
            .where(eq(posts.slug, cfSlug))
            .limit(1);
          cfSlugExists = !!existingCfSlug;
          if (cfSlugExists) {
            cfSlug = `${cfPost.slug}-${Date.now()}-${cfCounter}`;
            cfCounter++;
          }
        }
        customFieldsToInsert.push({
          post_type_id: cfPost.post_type_id,
          parent_id: newPostId,
          author_id: cfPost.author_id,
          id_locale_code: cfPost.id_locale_code,
          title: cfPost.title,
          slug: cfSlug,
          excerpt: cfPost.excerpt,
          body: cfPost.body,
          status: cfPost.status,
          meta_values: cfPost.meta_values,
          published_at: cfPost.published_at,
          created_at: now,
          updated_at: now,
        });
      }
      if (customFieldsToInsert.length > 0) {
        await db.insert(posts).values(customFieldsToInsert);
      }
    }

    const seoItems = customFieldPostsToItems(
      customFieldsPosts.map((cf) => ({ title: cf.title, meta_values: cf.meta_values })),
    );
    const seoResolved = resolveSeoValues(extractSeoFromCustomFields(seoItems), {
      title: newTitle,
      excerpt: originalPost.excerpt ?? "",
      slug: newSlug,
    });
    await upsertSeoMetadata(db, newPostId, seoResolved);

    const { syncPostSearchIndex } = await import("../../../../core/services/search-service.ts");
    await syncPostSearchIndex(db, newPostId);

    const editUrl = `/admin/${adminLocale}/content?post_type=${encodeURIComponent(postTypeSlug)}&action=edit&id=${newPostId}`;

    if (request.headers.get("HX-Request") === "true") {
      return htmxRedirectResponse(editUrl);
    }
    return new Response(JSON.stringify({ success: true, id: newPostId, redirect: editUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("POST /api/posts/[id]/duplicate-translation", err);
    return new Response(JSON.stringify({ success: false, error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
