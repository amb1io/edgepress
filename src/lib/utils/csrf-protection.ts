/**
 * Proteção CSRF (Cross-Site Request Forgery)
 * 
 * Better Auth já fornece proteção CSRF nativa através de:
 * - Validação de Origin header
 * - Tokens de sessão seguros
 * - Cookie SameSite
 * 
 * Este módulo adiciona camadas extras de proteção para endpoints customizados
 */

/**
 * Valida se a requisição veio de uma origem confiável
 * Verifica Origin e Referer headers
 * 
 * @param request - Request object
 * @param allowedOrigins - Lista de origens permitidas
 * @returns true se a origem é confiável
 * 
 * @example
 * const trusted = isValidOrigin(request, ["http://localhost:8788", "https://myapp.com"]);
 * if (!trusted) {
 *   return new Response("Forbidden", { status: 403 });
 * }
 */
export function isValidOrigin(
  request: Request,
  allowedOrigins: string[]
): boolean {
  // Requisições GET são geralmente seguras (idempotentes)
  // CSRF afeta principalmente POST/PUT/DELETE/PATCH
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  const origin = request.headers.get("Origin");
  const referer = request.headers.get("Referer");

  // Verificar Origin header (mais confiável)
  if (origin) {
    return allowedOrigins.includes(origin);
  }

  // Fallback para Referer (menos confiável, pode ser omitido)
  if (referer) {
    try {
      const refererURL = new URL(referer);
      return allowedOrigins.includes(refererURL.origin);
    } catch {
      return false;
    }
  }

  // Se não tem Origin nem Referer, bloquear por segurança
  return false;
}

/**
 * Verifica se a requisição tem o header X-Requested-With
 * Indica que foi feita via JavaScript (fetch/XMLHttpRequest) e não por navegação direta
 * 
 * @param request - Request object
 * @returns true se o header está presente
 */
export function hasXRequestedWith(request: Request): boolean {
  const header = request.headers.get("X-Requested-With");
  return header === "XMLHttpRequest" || header === "fetch";
}

/**
 * Valida Content-Type para prevenir CSRF via form submissions
 * CSRF attacks geralmente usam application/x-www-form-urlencoded ou multipart/form-data
 * JSON não pode ser enviado via HTML forms
 * 
 * @param request - Request object
 * @param requireJSON - Se true, aceita apenas application/json
 * @returns true se Content-Type é seguro
 */
export function hasSecureContentType(
  request: Request,
  requireJSON = false
): boolean {
  const contentType = request.headers.get("Content-Type") || "";

  if (requireJSON) {
    return contentType.includes("application/json");
  }

  // Aceita JSON e form-encoded (mas valida origem)
  return (
    contentType.includes("application/json") ||
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  );
}

/**
 * Aplica múltiplas verificações de CSRF
 * Combina validação de origem, headers e content-type
 * 
 * @param request - Request object
 * @param allowedOrigins - Lista de origens permitidas
 * @param options - Opções de validação
 * @returns Response com erro se bloqueado, null se permitido
 * 
 * @example
 * export const POST: APIRoute = async ({ request }) => {
 *   const csrfResponse = validateCSRF(request, [
 *     "http://localhost:8788",
 *     "https://myapp.com"
 *   ]);
 *   if (csrfResponse) return csrfResponse;
 *   
 *   // Processar requisição normalmente...
 * };
 */
export function validateCSRF(
  request: Request,
  allowedOrigins: string[],
  options: {
    requireXRequestedWith?: boolean;
    requireJSON?: boolean;
  } = {}
): Response | null {
  // Validar origem
  if (!isValidOrigin(request, allowedOrigins)) {
    return new Response(
      JSON.stringify({
        error: "forbidden",
        message: "Origem não confiável",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Validar X-Requested-With se requerido
  if (options.requireXRequestedWith && !hasXRequestedWith(request)) {
    return new Response(
      JSON.stringify({
        error: "forbidden",
        message: "Header X-Requested-With ausente",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Validar Content-Type
  if (!hasSecureContentType(request, options.requireJSON)) {
    return new Response(
      JSON.stringify({
        error: "bad_request",
        message: "Content-Type inválido",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return null;
}

/**
 * Obtém origens confiáveis do ambiente
 * Usado para configurar CSRF protection dinamicamente
 * 
 * @param env - Environment variables
 * @returns Lista de origens confiáveis
 */
export function getTrustedOrigins(env: {
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
}): string[] {
  const origins: string[] = [];

  // Adicionar BETTER_AUTH_URL
  if (env.BETTER_AUTH_URL) {
    origins.push(env.BETTER_AUTH_URL);
  }

  // Adicionar BETTER_AUTH_TRUSTED_ORIGINS
  if (env.BETTER_AUTH_TRUSTED_ORIGINS) {
    const trusted = env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((o) =>
      o.trim()
    );
    origins.push(...trusted);
  }

  // Adicionar localhost para desenvolvimento
  if (
    !origins.some((o) => o.includes("localhost") || o.includes("127.0.0.1"))
  ) {
    origins.push("http://localhost:8788");
  }

  return origins;
}
