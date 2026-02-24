import type { APIRoute } from "astro";

// Database
import { db } from "../../../../db/index.ts";
import { htmxRefreshResponse } from "../../../../lib/utils/http-responses.ts";
import { posts, postsMedia, postsTaxonomies, postTypes } from "../../../../db/schema.ts";

// ORM
import { eq, and } from "drizzle-orm";

// Auth: only editor or admin can duplicate posts
import { requireMinRole } from "../../../../lib/api-auth.ts";

// Services
import { getPostTypeId } from "../../../../lib/services/post-service.ts";

export const prerender = false;

/**
 * POST /api/posts/[id]/duplicate
 * Duplicates a post and all its relations
 * 
 * @description
 * - Fetches the original post with all its data
 * - Fetches and copies relations in posts_taxonomies (taxonomies)
 * - Fetches and copies relations in posts_media (attachments)
 * - Fetches and duplicates custom fields (child posts of type "custom_fields")
 *   - Creates new custom field records
 *   - Updates parent_id to point to the new duplicated post
 *   - Preserves all data including meta_values and rows
 * - Creates new post with incremented title and slug
 * - Returns JSON with the new post ID
 * 
 * @param {object} params - Route parameters
 * @param {string} params.id - ID of the post to be duplicated
 * @returns {Promise<Response>} JSON: {success: boolean, id?: number, error?: string}
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
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

  try {
    // Fetch the original post
    const [originalPost] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);

    if (!originalPost) {
      return new Response(JSON.stringify({ success: false, error: "Post not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Fetch taxonomy relations
    const taxonomyRelations = await db
      .select({ term_id: postsTaxonomies.term_id })
      .from(postsTaxonomies)
      .where(eq(postsTaxonomies.post_id, postId));

    // Fetch media relations
    const mediaRelations = await db
      .select({ media_id: postsMedia.media_id })
      .from(postsMedia)
      .where(eq(postsMedia.post_id, postId));

    // Fetch custom fields (child posts of type "custom_fields")
    const customFieldsTypeId = await getPostTypeId(db, "custom_fields");
    const customFieldsPosts = customFieldsTypeId
      ? await db
          .select()
          .from(posts)
          .where(
            and(
              eq(posts.parent_id, postId),
              eq(posts.post_type_id, customFieldsTypeId)
            )
          )
      : [];

    // Generate unique title and slug with an incremented number
    const baseTitle = originalPost.title;
    const baseSlug = originalPost.slug;

    // Find the next available number
    let newTitle = baseTitle;
    let newSlug = baseSlug;
    let counter = 1;
    let slugExists = true;

    while (slugExists) {
      newTitle = `${baseTitle} ${counter}`;
      newSlug = `${baseSlug}-${counter}`;

      // Check if the slug already exists (slug is unique in the database)
      const [existingSlug] = await db
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.slug, newSlug))
        .limit(1);

      slugExists = !!existingSlug;
      
      if (slugExists) {
        counter++;
      }
    }

    // Create a new post based on the original, but with new title and slug
    const now = Date.now();
    const [newPost] = await db
      .insert(posts)
      .values({
        post_type_id: originalPost.post_type_id,
        parent_id: originalPost.parent_id,
        author_id: originalPost.author_id,
        id_locale_code: originalPost.id_locale_code,
        title: newTitle,
        slug: newSlug,
        excerpt: originalPost.excerpt,
        body: originalPost.body,
        status: originalPost.status,
        meta_values: originalPost.meta_values,
        published_at: originalPost.status === "published" ? now : null,
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

    // Copy taxonomy relations
    if (taxonomyRelations.length > 0) {
      await db.insert(postsTaxonomies).values(
        taxonomyRelations.map((rel) => ({
          post_id: newPostId,
          term_id: rel.term_id,
        }))
      );
    }

    // Copy media relations
    if (mediaRelations.length > 0) {
      await db.insert(postsMedia).values(
        mediaRelations.map((rel) => ({
          post_id: newPostId,
          media_id: rel.media_id,
        }))
      );
    }

    // Duplicate custom fields (child posts of type "custom_fields")
    // Each custom field is a separate post with parent_id pointing to the parent post
    if (customFieldsPosts.length > 0 && customFieldsTypeId) {
      const customFieldsToInsert = [];
      
      for (const cfPost of customFieldsPosts) {
        // Generate a unique slug for each duplicated custom field
        let cfSlug = `${cfPost.slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let cfSlugExists = true;
        let cfCounter = 1;
        
        // Ensure the slug is unique in the database
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
        
        // Create a new custom field record with parent_id updated to the new post
        customFieldsToInsert.push({
          post_type_id: cfPost.post_type_id, // Keep the "custom_fields" type
          parent_id: newPostId, // IMPORTANT: Update parent_id to point to the duplicated post
          author_id: cfPost.author_id,
          id_locale_code: cfPost.id_locale_code,
          title: cfPost.title, // Keep the same custom field title
          slug: cfSlug, // Generated unique slug
          excerpt: cfPost.excerpt,
          body: cfPost.body,
          status: cfPost.status,
          meta_values: cfPost.meta_values, // Copy all meta_values including the rows array
          published_at: cfPost.published_at,
          created_at: now, // New creation timestamp
          updated_at: now, // New update timestamp
        });
      }
      
      // Inserir todos os custom fields duplicados de uma vez
      if (customFieldsToInsert.length > 0) {
        await db.insert(posts).values(customFieldsToInsert);
      }
    }

    if (request.headers.get("HX-Request") === "true") {
      return htmxRefreshResponse();
    }
    return new Response(JSON.stringify({ success: true, id: newPostId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("POST /api/posts/[id]/duplicate", err);
    return new Response(JSON.stringify({ success: false, error: "Internal Server Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
