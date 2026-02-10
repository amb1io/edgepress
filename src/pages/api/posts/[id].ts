import type { APIRoute } from "astro";

// Database
import { db } from "../../../db/index.ts";
import { posts, postsMedia, postsTaxonomies } from "../../../db/schema.ts";

// ORM
import { eq } from "drizzle-orm";

// Auth: apenas editor ou admin podem deletar posts
import { requireMinRole } from "../../../lib/api-auth.ts";

export const prerender = false;

/**
 * DELETE /api/posts/[id]
 * Deleta um post e suas relações
 * 
 * @description
 * - Deleta relações em posts_taxonomies
 * - Deleta relações em posts_media
 * - Deleta o post
 * - Retorna JSON com sucesso/erro
 * 
 * @param {object} params - Parâmetros da rota
 * @param {string} params.id - ID do post a ser deletado
 * @returns {Promise<Response>} JSON: {success: boolean, id?: number, error?: string}
 * 
 * @example Response sucesso:
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
    // Deletar relações de taxonomias
    await db.delete(postsTaxonomies).where(eq(postsTaxonomies.post_id, postId));
    
    // Deletar relações de media
    await db.delete(postsMedia).where(eq(postsMedia.post_id, postId));
    
    // Deletar o post
    await db.delete(posts).where(eq(posts.id, postId));
    
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
