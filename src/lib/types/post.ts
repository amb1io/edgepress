import type { POST_STATUSES } from '../constants/index.ts';

/**
 * Status de um post
 */
export type PostStatus = typeof POST_STATUSES[number];

/**
 * Dados de um post
 */
export interface Post {
  id: number;
  post_type_id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string | null;
  status: PostStatus;
  author_id: string | null;
  meta_values: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Dados do formulário de criação de post
 */
export interface PostCreatePayload {
  post_type_id: number;
  title: string;
  slug: string;
  excerpt?: string | null;
  body?: string | null;
  status: PostStatus;
  author_id?: string | null;
  meta_values?: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Dados do formulário de atualização de post
 */
export interface PostUpdatePayload {
  title?: string;
  slug?: string;
  excerpt?: string | null;
  body?: string | null;
  status?: PostStatus;
  author_id?: string | null;
  meta_values?: string | null;
  updated_at: number;
}

/**
 * Dados do formulário de post (antes de processar)
 */
export interface PostFormData {
  post_type: string;
  action: 'create' | 'edit';
  id?: number;
  locale: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  status: PostStatus;
  author_id: string | null;
  taxonomy_terms: number[];
  thumbnail_attachment_id?: number | null;
  blocknote_attachment_ids: number[];
  meta_values: Record<string, string>;
}

/**
 * Tipo de post
 */
export interface PostType {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Relação post-taxonomia
 */
export interface PostTaxonomy {
  post_id: number;
  term_id: number;
}

/**
 * Relação post-mídia
 */
export interface PostMedia {
  post_id: number;
  media_id: number;
}
