import { getString } from '../utils/form-data.ts';
import { isNonEmptyString, isValidPostStatus, normalizePostStatus } from '../utils/validation.ts';
import { POST_STATUSES } from '../constants/index.ts';

/**
 * Resultado de validação
 */
export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Dados do formulário de post parseados
 */
export interface PostFormData {
  post_type: string;
  action: string;
  id?: number;
  locale: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  status: typeof POST_STATUSES[number];
  author_id: string | null;
  taxonomy_terms: number[];
  thumbnail_attachment_id?: number | null;
  blocknote_attachment_ids: number[];
  meta_values: Record<string, string>;
}

/**
 * Valida os dados do formulário de post
 * @param formData - FormData a ser validado
 * @returns ValidationResult
 */
export function validatePostForm(formData: FormData): ValidationResult {
  const errors: Record<string, string> = {};

  const post_type = getString(formData, 'post_type');
  if (!isNonEmptyString(post_type)) {
    errors.post_type = 'Tipo de post é obrigatório';
  }

  const title = getString(formData, 'title');
  if (!isNonEmptyString(title)) {
    errors.title = 'Título é obrigatório';
  }

  const slug = getString(formData, 'slug');
  if (!isNonEmptyString(slug)) {
    errors.slug = 'Slug é obrigatório';
  }

  const status = getString(formData, 'status');
  if (!isValidPostStatus(status)) {
    errors.status = 'Status inválido';
  }

  const action = getString(formData, 'action');
  if (!['create', 'edit', 'new'].includes(action)) {
    errors.action = 'Ação inválida';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Valida um ID de post
 * @param id - ID a ser validado
 * @returns true se válido, false caso contrário
 */
export function validatePostId(id: string | number | null | undefined): boolean {
  if (id === null || id === undefined) {
    return false;
  }
  
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  return Number.isInteger(numId) && numId > 0;
}

/**
 * Valida um tipo de post
 * @param postType - Tipo de post a ser validado
 * @param allowedTypes - Array de tipos permitidos (opcional)
 * @returns true se válido, false caso contrário
 */
export function validatePostType(postType: string | null | undefined, allowedTypes?: string[]): boolean {
  if (!isNonEmptyString(postType)) {
    return false;
  }
  
  if (allowedTypes && allowedTypes.length > 0) {
    return allowedTypes.includes(postType as string);
  }
  
  return true;
}

/**
 * Normaliza os dados do formulário de post
 * @param formData - FormData a ser normalizado
 * @returns PostFormData normalizado
 */
export function normalizePostFormData(formData: FormData): Partial<PostFormData> {
  const post_type = getString(formData, 'post_type');
  const action = getString(formData, 'action');
  const idParam = getString(formData, 'id');
  const locale = getString(formData, 'locale', 'pt-br');
  const title = getString(formData, 'title');
  const slug = getString(formData, 'slug');
  const excerpt = getString(formData, 'excerpt', '');
  const body = getString(formData, 'body', '');
  const status = normalizePostStatus(getString(formData, 'status'));
  const authorIdRaw = getString(formData, 'author_id');
  const author_id = authorIdRaw === '' ? null : authorIdRaw;

  return {
    post_type,
    action,
    id: idParam !== '' ? parseInt(idParam, 10) : undefined,
    locale,
    title,
    slug,
    excerpt,
    body,
    status,
    author_id,
  };
}
