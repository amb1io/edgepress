import { eq, and, inArray } from "drizzle-orm";
import { postTypes, posts, postsTaxonomies, postsMedia } from "../../db/schema.ts";
import type { Database } from "../types/database.ts";
import type { PostCreatePayload, PostUpdatePayload } from "../types/post.ts";
import { parseMetaValues, mergeMetaValues, stringifyMetaValues } from "../utils/meta-parser.ts";

/**
 * Cria um novo post no banco de dados
 * @param db - Instância do banco de dados
 * @param payload - Dados do post a ser criado
 * @returns ID do post criado
 */
export async function createPost(db: Database, payload: PostCreatePayload): Promise<number> {
  const [inserted] = await db
    .insert(posts)
    .values(payload)
    .returning({ id: posts.id });
  
  return inserted?.id ?? 0;
}

/**
 * Atualiza um post existente no banco de dados
 * @param db - Instância do banco de dados
 * @param postId - ID do post a ser atualizado
 * @param postTypeId - ID do tipo de post (para validação)
 * @param payload - Dados a serem atualizados
 */
export async function updatePost(
  db: Database,
  postId: number,
  postTypeId: number,
  payload: PostUpdatePayload
): Promise<void> {
  await db
    .update(posts)
    .set(payload as Record<string, unknown>)
    .where(and(eq(posts.id, postId), eq(posts.post_type_id, postTypeId)));
}

/**
 * Atualiza os meta_values de um post, preservando valores existentes
 * @param db - Instância do banco de dados
 * @param postId - ID do post
 * @param postTypeId - ID do tipo de post
 * @param newMetaValues - Novos valores a serem mesclados
 * @returns String JSON dos meta_values mesclados
 */
export async function updatePostMetaValues(
  db: Database,
  postId: number,
  postTypeId: number,
  newMetaValues: Record<string, string>
): Promise<string | null> {
  // Buscar meta_values existentes
  const [existing] = await db
    .select({ meta_values: posts.meta_values })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.post_type_id, postTypeId)))
    .limit(1);
  
  // Mesclar valores
  const merged = mergeMetaValues(existing?.meta_values || null, newMetaValues);
  
  // Atualizar no banco
  await db
    .update(posts)
    .set({ meta_values: merged })
    .where(and(eq(posts.id, postId), eq(posts.post_type_id, postTypeId)));
  
  return merged;
}

/**
 * Adiciona ou atualiza um valor específico em meta_values
 * @param db - Instância do banco de dados
 * @param postId - ID do post
 * @param postTypeId - ID do tipo de post
 * @param key - Chave do meta_value
 * @param value - Valor a ser definido
 */
export async function setPostMetaValue(
  db: Database,
  postId: number,
  postTypeId: number,
  key: string,
  value: string
): Promise<void> {
  await updatePostMetaValues(db, postId, postTypeId, { [key]: value });
}

/**
 * Vincula taxonomias (termos) a um post
 * Remove vínculos existentes antes de criar os novos
 * @param db - Instância do banco de dados
 * @param postId - ID do post
 * @param termIds - Array de IDs dos termos a serem vinculados
 */
export async function linkPostTaxonomies(
  db: Database,
  postId: number,
  termIds: number[]
): Promise<void> {
  // Remover vínculos existentes
  await db.delete(postsTaxonomies).where(eq(postsTaxonomies.post_id, postId));
  
  // Criar novos vínculos se houver termos
  if (termIds.length > 0) {
    await db.insert(postsTaxonomies).values(
      termIds.map((term_id) => ({ post_id: postId, term_id }))
    );
  }
}

/**
 * Vincula mídias (attachments) a um post
 * Remove vínculos existentes antes de criar os novos
 * @param db - Instância do banco de dados
 * @param postId - ID do post
 * @param mediaIds - Array de IDs das mídias a serem vinculadas
 */
export async function linkPostMedia(
  db: Database,
  postId: number,
  mediaIds: number[]
): Promise<void> {
  // Remover relações existentes
  await db.delete(postsMedia).where(eq(postsMedia.post_id, postId));
  
  // Criar novas relações se houver mídias
  if (mediaIds.length > 0) {
    await db.insert(postsMedia).values(
      mediaIds.map((media_id) => ({ post_id: postId, media_id }))
    );
  }
}

/**
 * Valida e coleta IDs de attachments válidos
 * Verifica se os attachments existem e são do tipo 'attachment'
 * @param db - Instância do banco de dados
 * @param attachmentIds - Array de IDs a serem validados
 * @returns Array de IDs válidos
 */
export async function validateAttachments(
  db: Database,
  attachmentIds: number[]
): Promise<number[]> {
  if (attachmentIds.length === 0) {
    return [];
  }
  
  // Buscar o tipo attachment
  const [attachmentType] = await db
    .select({ id: postTypes.id })
    .from(postTypes)
    .where(eq(postTypes.slug, "attachment"))
    .limit(1);
  
  if (!attachmentType) {
    return [];
  }
  
  // Validar quais IDs são attachments válidos
  const validAttachments = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        inArray(posts.id, attachmentIds),
        eq(posts.post_type_id, attachmentType.id)
      )
    );
  
  return validAttachments.map((row) => row.id);
}

/**
 * Processa e vincula attachments a um post
 * Inclui thumbnail e attachments do blocknote
 * @param db - Instância do banco de dados
 * @param postId - ID do post
 * @param thumbnailId - ID do thumbnail (opcional)
 * @param blocknoteIds - IDs dos attachments do blocknote
 */
export async function processPostAttachments(
  db: Database,
  postId: number,
  thumbnailId?: number | null,
  blocknoteIds: number[] = []
): Promise<void> {
  const attachmentIdsToLink: number[] = [];
  
  // Coletar todos os IDs para validar
  const idsToValidate: number[] = [];
  if (thumbnailId && thumbnailId > 0) {
    idsToValidate.push(thumbnailId);
  }
  idsToValidate.push(...blocknoteIds);
  
  // Validar attachments
  const validIds = await validateAttachments(db, idsToValidate);
  
  // Adicionar apenas IDs válidos
  if (thumbnailId && validIds.includes(thumbnailId)) {
    attachmentIdsToLink.push(thumbnailId);
  }
  
  for (const id of blocknoteIds) {
    if (validIds.includes(id) && !attachmentIdsToLink.includes(id)) {
      attachmentIdsToLink.push(id);
    }
  }
  
  // Vincular attachments
  await linkPostMedia(db, postId, attachmentIdsToLink);
}

/**
 * Busca o ID de um post_type pelo slug
 * @param db - Instância do banco de dados
 * @param slug - Slug do post_type
 * @returns ID do post_type ou null se não encontrado
 */
export async function getPostTypeId(db: Database, slug: string): Promise<number | null> {
  const [typeRow] = await db
    .select({ id: postTypes.id })
    .from(postTypes)
    .where(eq(postTypes.slug, slug))
    .limit(1);
  
  return typeRow?.id ?? null;
}

/**
 * Verifica se um post existe
 * @param db - Instância do banco de dados
 * @param postId - ID do post
 * @param postTypeId - ID do tipo de post (opcional, para validação adicional)
 * @returns true se o post existe, false caso contrário
 */
export async function postExists(
  db: Database,
  postId: number,
  postTypeId?: number
): Promise<boolean> {
  const conditions = [eq(posts.id, postId)];
  if (postTypeId) {
    conditions.push(eq(posts.post_type_id, postTypeId));
  }
  
  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(...conditions))
    .limit(1);
  
  return !!post;
}
