import { CONTENT_TYPES, HTTP_STATUS_CODES } from '../constants/index.ts';
import { t } from '../../i18n/index.ts';
import { escapeHtml } from './form-data.ts';

/**
 * Utilitários para criar respostas HTTP padronizadas
 */

/**
 * Cria uma resposta JSON
 * @param data - Dados a serem serializados como JSON
 * @param status - Status HTTP (padrão: 200)
 * @param headers - Headers adicionais
 * @returns Response object
 */
export function jsonResponse(
  data: unknown,
  status: number = HTTP_STATUS_CODES.OK,
  headers?: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': CONTENT_TYPES.JSON,
      ...headers,
    },
  });
}

/**
 * Cria uma resposta de sucesso JSON
 * @param data - Dados de sucesso
 * @param status - Status HTTP (padrão: 200)
 * @returns Response object
 */
export function successResponse<T>(data: T, status: number = HTTP_STATUS_CODES.OK): Response {
  return jsonResponse({ success: true, data }, status);
}

/**
 * Cria uma resposta de erro JSON
 * @param message - Mensagem de erro
 * @param status - Status HTTP
 * @param details - Detalhes adicionais do erro
 * @returns Response object
 */
export function errorResponse(
  message: string,
  status: number = HTTP_STATUS_CODES.BAD_REQUEST,
  details?: unknown
): Response {
  const body: Record<string, unknown> = {
    success: false,
    error: message,
  };
  
  if (details !== undefined) {
    body.details = details;
  }
  
  return jsonResponse(body, status);
}

/**
 * Cria uma resposta de redirecionamento
 * @param url - URL de destino
 * @param status - Status HTTP (padrão: 302 Found)
 * @returns Response object
 */
export function redirectResponse(url: string, status: number = HTTP_STATUS_CODES.FOUND): Response {
  return Response.redirect(url, status);
}

/**
 * Cria uma resposta HTML
 * @param html - Conteúdo HTML
 * @param status - Status HTTP (padrão: 200)
 * @param headers - Headers adicionais
 * @returns Response object
 */
export function htmlResponse(
  html: string,
  status: number = HTTP_STATUS_CODES.OK,
  headers?: Record<string, string>
): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': CONTENT_TYPES.HTML,
      ...headers,
    },
  });
}

/**
 * Cria uma resposta de texto plano
 * @param text - Conteúdo de texto
 * @param status - Status HTTP (padrão: 200)
 * @returns Response object
 */
export function textResponse(text: string, status: number = HTTP_STATUS_CODES.OK): Response {
  return new Response(text, {
    status,
    headers: {
      'Content-Type': CONTENT_TYPES.TEXT,
    },
  });
}

/**
 * Cria uma resposta de erro interno do servidor
 * @param message - Mensagem de erro (padrão genérica)
 * @returns Response object
 */
export function internalServerErrorResponse(message: string = 'Internal Server Error'): Response {
  return errorResponse(message, HTTP_STATUS_CODES.INTERNAL_SERVER_ERROR);
}

/**
 * Cria uma resposta de não encontrado
 * @param message - Mensagem de erro
 * @returns Response object
 */
export function notFoundResponse(message: string = 'Not Found'): Response {
  return errorResponse(message, HTTP_STATUS_CODES.NOT_FOUND);
}

/**
 * Cria uma resposta de não autorizado
 * @param message - Mensagem de erro
 * @returns Response object
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): Response {
  return errorResponse(message, HTTP_STATUS_CODES.UNAUTHORIZED);
}

/**
 * Cria uma resposta de requisição inválida
 * @param message - Mensagem de erro
 * @param details - Detalhes da validação
 * @returns Response object
 */
export function badRequestResponse(message: string = 'Bad Request', details?: unknown): Response {
  return errorResponse(message, HTTP_STATUS_CODES.BAD_REQUEST, details);
}

/**
 * Resposta vazia com header HX-Refresh para o cliente HTMX recarregar a página
 * @returns Response object
 */
export function htmxRefreshResponse(): Response {
  return new Response('', {
    status: HTTP_STATUS_CODES.OK,
    headers: {
      'Content-Type': CONTENT_TYPES.HTML,
      'HX-Refresh': 'true',
    },
  });
}

/**
 * Resposta para HTMX redirecionar o cliente (200 + HX-Redirect)
 * @param url - URL de destino
 * @returns Response object
 */
export function htmxRedirectResponse(url: string): Response {
  return new Response('', {
    status: HTTP_STATUS_CODES.OK,
    headers: {
      'Content-Type': CONTENT_TYPES.HTML,
      'HX-Redirect': url,
    },
  });
}

/**
 * Resposta 400 com fragmento HTML para HTMX fazer swap em elemento de erro
 * @param message - Mensagem de erro (será escapada)
 * @returns Response object
 */
export function badRequestHtmlResponse(message: string): Response {
  const html = `<p class="text-error text-sm mt-2">${escapeHtml(message)}</p>`;
  return htmlResponse(html, HTTP_STATUS_CODES.BAD_REQUEST);
}

/**
 * Resposta HTML de erro reutilizável (ex.: para modais HTMX).
 * @param locale - Locale para a mensagem traduzida
 * @param messageKey - Chave i18n da mensagem (padrão: admin.taxonomy.errorMessage)
 * @param elementId - id do elemento &lt;p&gt; (padrão: taxonomy-modal-error)
 * @returns Response object com HTML 200
 */
export function errorHtmlResponse(
  locale: string,
  messageKey: string = 'admin.taxonomy.errorMessage',
  elementId: string = 'taxonomy-modal-error'
): Response {
  const msg = t(locale, messageKey);
  const html = `<p class="text-error text-sm mt-2" id="${escapeHtml(elementId)}">${escapeHtml(msg)}</p>`;
  return htmlResponse(html, HTTP_STATUS_CODES.OK);
}
