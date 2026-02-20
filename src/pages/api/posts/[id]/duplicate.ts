import type { APIRoute } from "astro";

// Database
import { db } from "../../../../db/index.ts";
import { htmxRefreshResponse } from "../../../../lib/utils/http-responses.ts";
import { posts, postsMedia, postsTaxonomies, postTypes } from "../../../../db/schema.ts";

// ORM
import { eq, and } from "drizzle-orm";

// Auth: apenas editor ou admin podem duplicar posts
import { requireMinRole } from "../../../../lib/api-auth.ts";

// Services
import { getPostTypeId } from "../../../../lib/services/post-service.ts";

export const prerender = false;

/**
 * POST /api/posts/[id]/duplicate
 * Duplica um post e todas as suas relações
 * 
 * @description
 * - Busca o post original com todos os seus dados
 * - Busca e copia relações em posts_taxonomies (taxonomias)
 * - Busca e copia relações em posts_media (attachments)
 * - Busca e duplica custom fields (posts filhos do tipo "custom_fields")
 *   - Cria novos registros de custom fields
 *   - Atualiza parent_id para apontar para o novo post duplicado
 *   - Preserva todos os dados incluindo meta_values e rows
 * - Cria novo post com título e slug incrementados
 * - Retorna JSON com o ID do novo post
 * 
 * @param {object} params - Parâmetros da rota
 * @param {string} params.id - ID do post a ser duplicado
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
    // Buscar o post original
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

    // Buscar relações de taxonomias
    const taxonomyRelations = await db
      .select({ term_id: postsTaxonomies.term_id })
      .from(postsTaxonomies)
      .where(eq(postsTaxonomies.post_id, postId));

    // Buscar relações de media
    const mediaRelations = await db
      .select({ media_id: postsMedia.media_id })
      .from(postsMedia)
      .where(eq(postsMedia.post_id, postId));

    // Buscar custom fields (posts filhos do tipo "custom_fields")
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

    // Gerar título e slug únicos com número incrementado
    const baseTitle = originalPost.title;
    const baseSlug = originalPost.slug;

    // Encontrar o próximo número disponível
    let newTitle = baseTitle;
    let newSlug = baseSlug;
    let counter = 1;
    let slugExists = true;

    while (slugExists) {
      newTitle = `${baseTitle} ${counter}`;
      newSlug = `${baseSlug}-${counter}`;

      // Verificar se slug já existe (slug é único no banco)
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

    // Criar novo post com dados do original, mas com novo título e slug
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

    // Copiar relações de taxonomias
    if (taxonomyRelations.length > 0) {
      await db.insert(postsTaxonomies).values(
        taxonomyRelations.map((rel) => ({
          post_id: newPostId,
          term_id: rel.term_id,
        }))
      );
    }

    // Copiar relações de media
    if (mediaRelations.length > 0) {
      await db.insert(postsMedia).values(
        mediaRelations.map((rel) => ({
          post_id: newPostId,
          media_id: rel.media_id,
        }))
      );
    }

    // Duplicar custom fields (posts filhos do tipo "custom_fields")
    // Cada custom field é um post separado com parent_id apontando para o post pai
    if (customFieldsPosts.length > 0 && customFieldsTypeId) {
      const customFieldsToInsert = [];
      
      for (const cfPost of customFieldsPosts) {
        // Gerar slug único para cada custom field duplicado
        let cfSlug = `${cfPost.slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let cfSlugExists = true;
        let cfCounter = 1;
        
        // Garantir que o slug seja único no banco
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
        
        // Criar novo registro de custom field com parent_id atualizado para o novo post
        customFieldsToInsert.push({
          post_type_id: cfPost.post_type_id, // Mantém o tipo "custom_fields"
          parent_id: newPostId, // IMPORTANTE: Atualiza parent_id para apontar para o post duplicado
          author_id: cfPost.author_id,
          id_locale_code: cfPost.id_locale_code,
          title: cfPost.title, // Mantém o mesmo título do custom field
          slug: cfSlug, // Slug único gerado
          excerpt: cfPost.excerpt,
          body: cfPost.body,
          status: cfPost.status,
          meta_values: cfPost.meta_values, // Copia todos os meta_values incluindo o array de rows
          published_at: cfPost.published_at,
          created_at: now, // Novo timestamp de criação
          updated_at: now, // Novo timestamp de atualização
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
