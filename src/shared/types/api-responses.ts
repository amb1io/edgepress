/**
 * Tipos padronizados para respostas de API
 */

/**
 * Resposta de sucesso da API
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * Resposta de erro da API
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: unknown;
}

/**
 * Erro de validação com detalhes dos campos
 */
export interface ApiValidationError extends ApiErrorResponse {
  details: {
    fields: Record<string, string>;
  };
}

/**
 * Resposta de lista paginada
 */
export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Tipo união de respostas de API
 */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse | ApiValidationError;
