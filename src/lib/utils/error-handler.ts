import {
  internalServerErrorResponse,
  errorResponse,
} from "./http-responses.ts";
import { getErrorMessage } from "../constants/error-messages.ts";

/**
 * Estrutura de log de erro
 */
interface ErrorLogData {
  context: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Loga um erro de forma estruturada
 * @param context - Contexto onde o erro ocorreu
 * @param error - Erro capturado
 * @param metadata - Metadados adicionais
 */
export function logError(
  context: string,
  error: unknown,
  metadata?: Record<string, unknown>,
): void {
  const errorData: ErrorLogData = {
    context,
    message: error instanceof Error ? error.message : String(error),
    timestamp: new Date().toISOString(),
  };

  if (error instanceof Error && error.stack) {
    errorData.stack = error.stack;
  }

  if (metadata) {
    errorData.metadata = metadata;
  }

  // TODO: Integrar com serviço de logging (ex: Sentry, LogRocket, etc)
  console.error("[ERROR]", JSON.stringify(errorData, null, 2));
}

/**
 * Loga uma informação de forma estruturada
 * @param message - Mensagem a ser logada
 * @param metadata - Metadados adicionais
 */
export function logInfo(
  message: string,
  metadata?: Record<string, unknown>,
): void {
  const logData = {
    message,
    metadata,
    timestamp: new Date().toISOString(),
  };

  console.log("[INFO]", JSON.stringify(logData, null, 2));
}

/**
 * Loga um warning de forma estruturada
 * @param message - Mensagem de warning
 * @param metadata - Metadados adicionais
 */
export function logWarning(
  message: string,
  metadata?: Record<string, unknown>,
): void {
  const logData = {
    message,
    metadata,
    timestamp: new Date().toISOString(),
  };

  console.warn("[WARNING]", JSON.stringify(logData, null, 2));
}

/**
 * Manipula um erro de API e retorna uma Response apropriada
 * @param error - Erro capturado
 * @param context - Contexto onde o erro ocorreu
 * @param locale - Locale para mensagens de erro
 * @returns Response object
 */
export function handleApiError(
  error: unknown,
  context: string,
  locale: string = "pt-br",
): Response {
  logError(context, error);

  // Se o erro tem um status HTTP customizado, usar ele
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    const status = error.status;
    const message =
      error instanceof Error
        ? error.message
        : getErrorMessage("INTERNAL_SERVER_ERROR", locale);
    return errorResponse(message, status);
  }

  // Erro genérico
  const message = getErrorMessage("INTERNAL_SERVER_ERROR", locale);
  return internalServerErrorResponse(message);
}

/**
 * Cria uma resposta de erro customizada
 * @param message - Mensagem de erro
 * @param status - Status HTTP
 * @param locale - Locale para mensagens (opcional)
 * @returns Response object
 */
export function createErrorResponse(
  message: string,
  status: number,
  locale?: string,
): Response {
  return errorResponse(message, status);
}

/**
 * Classe de erro customizada com status HTTP
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Cria um ApiError para validação
 * @param message - Mensagem de erro
 * @param details - Detalhes de validação
 * @returns ApiError
 */
export function validationError(message: string, details?: unknown): ApiError {
  return new ApiError(message, 400, details);
}

/**
 * Cria um ApiError para recurso não encontrado
 * @param message - Mensagem de erro
 * @returns ApiError
 */
export function notFoundError(message: string): ApiError {
  return new ApiError(message, 404);
}

/**
 * Cria um ApiError para não autorizado
 * @param message - Mensagem de erro
 * @returns ApiError
 */
export function unauthorizedError(message: string): ApiError {
  return new ApiError(message, 401);
}
