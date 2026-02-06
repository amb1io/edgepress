import { eq, and, like, inArray } from "drizzle-orm";
import { postTypes, posts, postsMedia } from "../../db/schema.ts";
import type { Database } from "../types/database.ts";
import type { Media, MediaMetadata, MediaWithMetadata } from "../types/media.ts";
import { parseMetaValues } from "../utils/meta-parser.ts";

/**
 * Busca o ID do post_type 'attachment'
 * @param db - Instância do banco de dados
 * @returns ID do post_type attachment ou null se não encontrado
 */
export async function getAttachmentTypeId(db: Database): Promise<number | null> {
  const [typeRow] = await db
    .select({ id: postTypes.id })
    .from(postTypes)
    .where(eq(postTypes.slug, "attachment"))
    .limit(1);
  
  return typeRow?.id ?? null;
}

/**
 * Busca um attachment por ID
 * @param db - Instância do banco de dados
 * @param mediaId - ID do attachment
 * @returns Media ou null se não encontrado
 */
export async function getMediaById(db: Database, mediaId: number): Promise<Media | null> {
  const attachmentTypeId = await getAttachmentTypeId(db);
  if (!attachmentTypeId) {
    return null;
  }
  
  const [media] = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      body: posts.body,
      author_id: posts.author_id,
      meta_values: posts.meta_values,
      created_at: posts.created_at,
      updated_at: posts.updated_at,
    })
    .from(posts)
    .where(and(eq(posts.id, mediaId), eq(posts.post_type_id, attachmentTypeId)))
    .limit(1);
  
  return media as Media ?? null;
}

/**
 * Busca um attachment com metadados parseados
 * @param db - Instância do banco de dados
 * @param mediaId - ID do attachment
 * @returns MediaWithMetadata ou null se não encontrado
 */
export async function getMediaWithMetadata(db: Database, mediaId: number): Promise<MediaWithMetadata | null> {
  const media = await getMediaById(db, mediaId);
  if (!media) {
    return null;
  }
  
  const metadata = parseMetaValues(media.meta_values) as unknown as MediaMetadata;
  
  return {
    ...media,
    metadata,
  };
}

/**
 * Busca attachments vinculados a um post
 * @param db - Instância do banco de dados
 * @param postId - ID do post
 * @returns Array de Media
 */
export async function getPostMedia(db: Database, postId: number): Promise<Media[]> {
  const attachmentTypeId = await getAttachmentTypeId(db);
  if (!attachmentTypeId) {
    return [];
  }
  
  const results = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      body: posts.body,
      author_id: posts.author_id,
      meta_values: posts.meta_values,
      created_at: posts.created_at,
      updated_at: posts.updated_at,
    })
    .from(postsMedia)
    .innerJoin(posts, eq(postsMedia.media_id, posts.id))
    .where(and(
      eq(postsMedia.post_id, postId),
      eq(posts.post_type_id, attachmentTypeId)
    ));
  
  return results as Media[];
}

/**
 * Busca attachments vinculados a um post com metadados parseados
 * @param db - Instância do banco de dados
 * @param postId - ID do post
 * @returns Array de MediaWithMetadata
 */
export async function getPostMediaWithMetadata(db: Database, postId: number): Promise<MediaWithMetadata[]> {
  const mediaList = await getPostMedia(db, postId);
  
  return mediaList.map(media => ({
    ...media,
    metadata: parseMetaValues(media.meta_values) as unknown as MediaMetadata,
  }));
}

/**
 * Busca attachments por IDs
 * @param db - Instância do banco de dados
 * @param mediaIds - Array de IDs de attachments
 * @returns Array de Media
 */
export async function getMediaByIds(db: Database, mediaIds: number[]): Promise<Media[]> {
  if (mediaIds.length === 0) {
    return [];
  }
  
  const attachmentTypeId = await getAttachmentTypeId(db);
  if (!attachmentTypeId) {
    return [];
  }
  
  const results = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      body: posts.body,
      author_id: posts.author_id,
      meta_values: posts.meta_values,
      created_at: posts.created_at,
      updated_at: posts.updated_at,
    })
    .from(posts)
    .where(and(
      inArray(posts.id, mediaIds),
      eq(posts.post_type_id, attachmentTypeId)
    ));
  
  return results as Media[];
}

/**
 * Busca posts que usam um attachment específico
 * @param db - Instância do banco de dados
 * @param mediaId - ID do attachment
 * @returns Array de IDs de posts
 */
export async function getPostsByMedia(db: Database, mediaId: number): Promise<number[]> {
  const results = await db
    .select({ post_id: postsMedia.post_id })
    .from(postsMedia)
    .where(eq(postsMedia.media_id, mediaId));
  
  return results.map(r => r.post_id);
}

/**
 * Verifica se um attachment existe
 * @param db - Instância do banco de dados
 * @param mediaId - ID do attachment
 * @returns true se existe, false caso contrário
 */
export async function mediaExists(db: Database, mediaId: number): Promise<boolean> {
  const attachmentTypeId = await getAttachmentTypeId(db);
  if (!attachmentTypeId) {
    return false;
  }
  
  const [result] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, mediaId), eq(posts.post_type_id, attachmentTypeId)))
    .limit(1);
  
  return !!result;
}

/**
 * Busca attachments por tipo MIME
 * @param db - Instância do banco de dados
 * @param mimeType - Tipo MIME (ex: 'image/jpeg')
 * @param limit - Limite de resultados
 * @returns Array de Media
 */
export async function getMediaByMimeType(
  db: Database,
  mimeType: string,
  limit: number = 50
): Promise<Media[]> {
  const attachmentTypeId = await getAttachmentTypeId(db);
  if (!attachmentTypeId) {
    return [];
  }
  
  // Buscar por mime_type nos meta_values usando JSON extract
  const results = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      body: posts.body,
      author_id: posts.author_id,
      meta_values: posts.meta_values,
      created_at: posts.created_at,
      updated_at: posts.updated_at,
    })
    .from(posts)
    .where(and(
      eq(posts.post_type_id, attachmentTypeId),
      like(posts.meta_values, `%"mime_type":"${mimeType}"%`)
    ))
    .limit(limit);
  
  return results as Media[];
}

/**
 * Busca attachments de imagem
 * @param db - Instância do banco de dados
 * @param limit - Limite de resultados
 * @returns Array de Media
 */
export async function getImageAttachments(db: Database, limit: number = 50): Promise<Media[]> {
  const attachmentTypeId = await getAttachmentTypeId(db);
  if (!attachmentTypeId) {
    return [];
  }
  
  const results = await db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      excerpt: posts.excerpt,
      body: posts.body,
      author_id: posts.author_id,
      meta_values: posts.meta_values,
      created_at: posts.created_at,
      updated_at: posts.updated_at,
    })
    .from(posts)
    .where(and(
      eq(posts.post_type_id, attachmentTypeId),
      like(posts.meta_values, '%"mime_type":"image/%')
    ))
    .limit(limit);
  
  return results as Media[];
}

/**
 * Deleta um attachment e suas relações
 * @param db - Instância do banco de dados
 * @param mediaId - ID do attachment
 */
export async function deleteMedia(db: Database, mediaId: number): Promise<void> {
  // Remover relações com posts
  await db.delete(postsMedia).where(eq(postsMedia.media_id, mediaId));
  
  // Deletar o attachment
  await db.delete(posts).where(eq(posts.id, mediaId));
}
