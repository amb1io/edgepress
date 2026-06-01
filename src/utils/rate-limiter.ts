/**
 * Rate Limiter para proteção contra brute force e DoS
 * Usa Map em memória para Cloudflare Workers (sem estado compartilhado entre workers)
 * Para produção com múltiplos workers, considerar KV ou Durable Objects
 */

/**
 * Interface para configuração de rate limit
 */
export interface RateLimitConfig {
  /** Número máximo de requisições permitidas */
  maxRequests: number;
  /** Janela de tempo em milissegundos */
  windowMs: number;
  /** Mensagem de erro personalizada */
  message?: string;
}

/**
 * Registro de requisições para um identificador
 */
interface RateLimitRecord {
  /** Timestamp da primeira requisição na janela atual */
  windowStart: number;
  /** Número de requisições na janela atual */
  count: number;
}

/**
 * Armazenamento em memória de rate limits
 * Nota: Em ambiente de produção com múltiplos workers, considerar usar KV Store
 */
const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Limpa registros expirados do store (garbage collection).
 * Chamada dentro do handler (nunca no escopo global) para ser compatível com
 * Cloudflare Workers, onde setInterval/setTimeout não são permitidos no global scope.
 */
function cleanupExpiredRecords() {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  for (const [key, record] of rateLimitStore.entries()) {
    if (now - record.windowStart > oneHour) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Verifica se uma requisição deve ser bloqueada por rate limit
 * Usa algoritmo de Fixed Window
 * 
 * @param identifier - Identificador único (ex: IP, user ID, email)
 * @param config - Configuração de rate limit
 * @returns Objeto com resultado da verificação
 * 
 * @example
 * const result = checkRateLimit("192.168.1.1", {
 *   maxRequests: 5,
 *   windowMs: 15 * 60 * 1000, // 15 minutos
 *   message: "Muitas tentativas de login"
 * });
 * 
 * if (result.limited) {
 *   return new Response(result.message, { status: 429 });
 * }
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): {
  limited: boolean;
  remaining: number;
  resetAt: Date;
  message: string;
} {
  cleanupExpiredRecords();
  const now = Date.now();
  const record = rateLimitStore.get(identifier);

  // Se não há registro ou a janela expirou, criar novo
  if (!record || now - record.windowStart >= config.windowMs) {
    rateLimitStore.set(identifier, {
      windowStart: now,
      count: 1,
    });

    return {
      limited: false,
      remaining: config.maxRequests - 1,
      resetAt: new Date(now + config.windowMs),
      message: "",
    };
  }

  // Incrementar contador
  record.count++;

  // Verificar se excedeu o limite
  if (record.count > config.maxRequests) {
    const resetAt = new Date(record.windowStart + config.windowMs);
    const resetIn = Math.ceil((resetAt.getTime() - now) / 1000 / 60); // minutos

    return {
      limited: true,
      remaining: 0,
      resetAt,
      message:
        config.message ||
        `Muitas requisições. Tente novamente em ${resetIn} minuto(s).`,
    };
  }

  return {
    limited: false,
    remaining: config.maxRequests - record.count,
    resetAt: new Date(record.windowStart + config.windowMs),
    message: "",
  };
}

/**
 * Obtém configuração de rate limit do ambiente ou usa valor padrão
 * 
 * @param envValue - Valor da variável de ambiente (pode ser undefined)
 * @param defaultValue - Valor padrão se env não estiver definida
 * @returns Número parseado ou valor padrão
 */
function getEnvNumber(envValue: string | undefined, defaultValue: number): number {
  if (!envValue) return defaultValue;
  const parsed = parseInt(envValue, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Obtém configurações de rate limit do ambiente
 * Permite customização via variáveis de ambiente
 * 
 * @param env - Environment variables (opcional)
 * @returns Configurações de rate limit
 * 
 * @example
 * // No código
 * const limits = getRateLimits(import.meta.env);
 * 
 * // No .env
 * RATE_LIMIT_LOGIN_MAX=10
 * RATE_LIMIT_LOGIN_WINDOW_MIN=30
 */
export function getRateLimits(env?: Record<string, string | undefined>) {
  return {
    /** Login: configurável via RATE_LIMIT_LOGIN_MAX e RATE_LIMIT_LOGIN_WINDOW_MIN */
    LOGIN: {
      maxRequests: getEnvNumber(env?.RATE_LIMIT_LOGIN_MAX, 5),
      windowMs: getEnvNumber(env?.RATE_LIMIT_LOGIN_WINDOW_MIN, 15) * 60 * 1000,
      message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
    },

    /** Register: configurável via RATE_LIMIT_REGISTER_MAX e RATE_LIMIT_REGISTER_WINDOW_MIN */
    REGISTER: {
      maxRequests: getEnvNumber(env?.RATE_LIMIT_REGISTER_MAX, 3),
      windowMs: getEnvNumber(env?.RATE_LIMIT_REGISTER_WINDOW_MIN, 60) * 60 * 1000,
      message: "Muitas tentativas de registro. Tente novamente em 1 hora.",
    },

    /** Upload: configurável via RATE_LIMIT_UPLOAD_MAX e RATE_LIMIT_UPLOAD_WINDOW_MIN */
    UPLOAD: {
      maxRequests: getEnvNumber(env?.RATE_LIMIT_UPLOAD_MAX, 20),
      windowMs: getEnvNumber(env?.RATE_LIMIT_UPLOAD_WINDOW_MIN, 60) * 60 * 1000,
      message: "Limite de uploads excedido. Tente novamente em 1 hora.",
    },

    /** API geral: configurável via RATE_LIMIT_API_MAX e RATE_LIMIT_API_WINDOW_MIN */
    API_GENERAL: {
      maxRequests: getEnvNumber(env?.RATE_LIMIT_API_MAX, 100),
      windowMs: getEnvNumber(env?.RATE_LIMIT_API_WINDOW_MIN, 1) * 60 * 1000,
      message: "Muitas requisições. Tente novamente em 1 minuto.",
    },
  };
}

/**
 * Configurações predefinidas de rate limit com valores padrão
 * Use getRateLimits(env) para valores customizáveis
 */
export const RATE_LIMITS = getRateLimits();

/**
 * Extrai IP do request
 * Considera headers de proxy (Cloudflare)
 * 
 * @param request - Request object
 * @returns Endereço IP do cliente
 */
export function getClientIP(request: Request): string {
  // Cloudflare fornece CF-Connecting-IP
  const cfIP = request.headers.get("CF-Connecting-IP");
  if (cfIP) return cfIP;

  // Fallback para outros headers comuns
  const xForwardedFor = request.headers.get("X-Forwarded-For");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }

  const xRealIP = request.headers.get("X-Real-IP");
  if (xRealIP) return xRealIP;

  // Fallback para "unknown" se não conseguir detectar
  return "unknown";
}

/**
 * Middleware helper para aplicar rate limiting
 * 
 * @param request - Request object
 * @param config - Configuração de rate limit
 * @param identifier - Identificador customizado (padrão: IP do cliente)
 * @returns Response com erro 429 se bloqueado, null se permitido
 * 
 * @example
 * export const POST: APIRoute = async ({ request }) => {
 *   const rateLimitResponse = applyRateLimit(request, RATE_LIMITS.LOGIN);
 *   if (rateLimitResponse) return rateLimitResponse;
 *   
 *   // Processar requisição normalmente...
 * };
 */
export function applyRateLimit(
  request: Request,
  config: RateLimitConfig,
  identifier?: string
): Response | null {
  const id = identifier || getClientIP(request);
  const result = checkRateLimit(id, config);

  if (result.limited) {
    return new Response(
      JSON.stringify({
        error: "rate_limit_exceeded",
        message: result.message,
        resetAt: result.resetAt.toISOString(),
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": Math.ceil(
            (result.resetAt.getTime() - Date.now()) / 1000
          ).toString(),
          "X-RateLimit-Limit": config.maxRequests.toString(),
          "X-RateLimit-Remaining": result.remaining.toString(),
          "X-RateLimit-Reset": result.resetAt.toISOString(),
        },
      }
    );
  }

  return null;
}

/**
 * Reseta o rate limit de um identificador específico
 * Útil para testes ou após ação administrativa
 * 
 * @param identifier - Identificador a ser resetado
 */
export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * Limpa todo o store de rate limits
 * Útil para testes
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}
