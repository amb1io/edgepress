/**
 * Tipos relacionados a mídia (attachments)
 */

/**
 * Tipo de mídia
 */
export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'other';

/**
 * Estrutura de um attachment (mídia)
 * Um attachment é um post com post_type_id = 'attachment'
 */
export interface Media {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  author_id: string | null;
  meta_values: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Metadados de uma mídia extraídos de meta_values
 */
export interface MediaMetadata {
  file_path?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  width?: number;
  height?: number;
  duration?: number;
  alt_text?: string;
  caption?: string;
  [key: string]: string | number | undefined;
}

/**
 * Mídia com metadados parseados
 */
export interface MediaWithMetadata extends Media {
  metadata: MediaMetadata;
  url?: string;
  thumbnail_url?: string;
}

/**
 * Payload para upload de mídia
 */
export interface MediaUploadPayload {
  file: File;
  title?: string;
  alt_text?: string;
  caption?: string;
  author_id?: string;
}

/**
 * Resultado de upload de mídia
 */
export interface MediaUploadResult {
  id: number;
  url: string;
  file_name: string;
  file_size: number;
  mime_type: string;
}

/**
 * Filtros para listagem de mídia
 */
export interface MediaFilters {
  mime_type?: string;
  author_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}
