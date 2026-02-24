import type { APIRoute } from "astro";

// Database
import { db } from "../../../db/index.ts";
import { posts, postsMedia, postsTaxonomies } from "../../../db/schema.ts";

// ORM
import { eq } from "drizzle-orm";

// Auth: only editor or admin can delete posts
import { requireMinRole } from "../../../lib/api-auth.ts";
import { htmxRefreshResponse } from "../../../lib/utils/http-responses.ts";

export const prerender = false;

/**
 * DELETE /api/posts/[id]
 * Deletes a post and its relations
 *
 * @description
 * - Deletes relations in posts_taxonomies
 * - Deletes relations in posts_media
 * - Deletes the post
 * - Returns JSON with success/error
 *
 * @param {object} params - Route parameters
 * @param {string} params.id - ID of the post to be deleted
 * @returns {Promise<Response>} JSON: {success: boolean, id?: number, error?: string}
 *
 * @example Success response:
 * {
 *   "success": true,
 *   "id": 123
 * }
 * 
 * @example Response erro:
 * {
 *   "success": false,
 *   "error": "Bad Request"
 * }
 */
export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 1, locals);
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
    // Delete taxonomy relations
    await db.delete(postsTaxonomies).where(eq(postsTaxonomies.post_id, postId));
    
    // Delete media relations
    await db.delete(postsMedia).where(eq(postsMedia.post_id, postId));
    
    // Deletar o post
    await db.delete(posts).where(eq(posts.id, postId));

    if (request.headers.get("HX-Request") === "true") {
      return htmxRefreshResponse();
    }
    return new Response(JSON.stringify({ success: true, id: postId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("DELETE /api/posts/[id]", err);
    return new Response(JSON.stringify({ success: false, error: "Internal Server Error" }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
