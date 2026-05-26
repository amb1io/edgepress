/**
 * Tipos relacionados a taxonomias (categorias, tags, etc)
 */

/**
 * Tipo de taxonomia
 */
export type TaxonomyType = 'category' | 'tag' | string;

/**
 * Estrutura de uma taxonomia
 */
export interface Taxonomy {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: TaxonomyType;
  parent_id: number | null;
  meta_values: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Payload para criar uma taxonomia
 */
export interface TaxonomyCreatePayload {
  name: string;
  slug: string;
  description?: string | null;
  type: TaxonomyType;
  parent_id?: number | null;
  meta_values?: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Payload para atualizar uma taxonomia
 */
export interface TaxonomyUpdatePayload {
  name?: string;
  slug?: string;
  description?: string | null;
  type?: TaxonomyType;
  parent_id?: number | null;
  meta_values?: string | null;
  updated_at: number;
}

/**
 * Dados do formulário de taxonomia
 */
export interface TaxonomyFormData {
  name: string;
  slug: string;
  description: string;
  type: TaxonomyType;
  parent_id?: number | null;
  meta_values?: Record<string, string>;
}

/**
 * Taxonomia com informações adicionais (ex: contagem de posts)
 */
export interface TaxonomyWithCount extends Taxonomy {
  post_count: number;
}
