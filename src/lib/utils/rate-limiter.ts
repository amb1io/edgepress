/**
 * Rate Limiter for brute force and DoS protection
 * Uses in-memory Map for Cloudflare Workers (no shared state between workers)
 * For production with multiple workers, consider KV or Durable Objects
 */

/**
 * Interface for rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Custom error message */
  message?: string;
}

/**
 * Request record for an identifier
 */
interface RateLimitRecord {
  /** Timestamp of first request in current window */
  windowStart: number;
  /** Number of requests in current window */
  count: number;
}

/**
 * In-memory rate limit storage
 * Note: In production with multiple workers, consider using KV Store
 */
const rateLimitStore = new Map<string, RateLimitRecord>();

/**
 * Cleans up expired records from the store (garbage collection).
 * Called inside the handler (never in global scope) to be compatible with
 * Cloudflare Workers, where setInterval/setTimeout are not allowed in global scope.
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
 * Checks whether a request should be blocked by rate limit
 * Uses Fixed Window algorithm
 *
 * @param identifier - Unique identifier (e.g. IP, user ID, email)
 * @param config - Rate limit configuration
 * @returns Object with verification result
 *
 * @example
 * const result = checkRateLimit("192.168.1.1", {
 *   maxRequests: 5,
 *   windowMs: 15 * 60 * 1000, // 15 minutes
 *   message: "Too many login attempts"
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

  // If no record or window expired, create new one
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

  // Increment counter
  record.count++;

  // Check if limit exceeded
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
 * Gets rate limit config from environment or uses default value
 *
 * @param envValue - Environment variable value (may be undefined)
 * @param defaultValue - Default value if env is not set
 * @returns Parsed number or default value
 */
function getEnvNumber(envValue: string | undefined, defaultValue: number): number {
  if (!envValue) return defaultValue;
  const parsed = parseInt(envValue, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Gets rate limit settings from environment
 * Allows customization via environment variables
 *
 * @param env - Environment variables (optional)
 * @returns Rate limit settings
 * 
 * @example
 * // In code
 * const limits = getRateLimits(import.meta.env);
 * 
 * // No .env
 * RATE_LIMIT_LOGIN_MAX=10
 * RATE_LIMIT_LOGIN_WINDOW_MIN=30
 */
export function getRateLimits(env?: Record<string, string | undefined>) {
  return {
    /** Login: configurable via RATE_LIMIT_LOGIN_MAX and RATE_LIMIT_LOGIN_WINDOW_MIN */
    LOGIN: {
      maxRequests: getEnvNumber(env?.RATE_LIMIT_LOGIN_MAX, 5),
      windowMs: getEnvNumber(env?.RATE_LIMIT_LOGIN_WINDOW_MIN, 15) * 60 * 1000,
      message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
    },

    /** Register: configurable via RATE_LIMIT_REGISTER_MAX and RATE_LIMIT_REGISTER_WINDOW_MIN */
    REGISTER: {
      maxRequests: getEnvNumber(env?.RATE_LIMIT_REGISTER_MAX, 3),
      windowMs: getEnvNumber(env?.RATE_LIMIT_REGISTER_WINDOW_MIN, 60) * 60 * 1000,
      message: "Muitas tentativas de registro. Tente novamente em 1 hora.",
    },

    /** Upload: configurable via RATE_LIMIT_UPLOAD_MAX and RATE_LIMIT_UPLOAD_WINDOW_MIN */
    UPLOAD: {
      maxRequests: getEnvNumber(env?.RATE_LIMIT_UPLOAD_MAX, 20),
      windowMs: getEnvNumber(env?.RATE_LIMIT_UPLOAD_WINDOW_MIN, 60) * 60 * 1000,
      message: "Limite de uploads excedido. Tente novamente em 1 hora.",
    },

    /** General API: configurable via RATE_LIMIT_API_MAX and RATE_LIMIT_API_WINDOW_MIN */
    API_GENERAL: {
      maxRequests: getEnvNumber(env?.RATE_LIMIT_API_MAX, 100),
      windowMs: getEnvNumber(env?.RATE_LIMIT_API_WINDOW_MIN, 1) * 60 * 1000,
      message: "Muitas requisições. Tente novamente em 1 minuto.",
    },
  };
}

/**
 * Predefined rate limit settings with default values
 * Use getRateLimits(env) for customizable values
 */
export const RATE_LIMITS = getRateLimits();

/**
 * Extracts IP from request
 * Considers proxy headers (Cloudflare)
 *
 * @param request - Request object
 * @returns Client IP address
 */
export function getClientIP(request: Request): string {
  // Cloudflare provides CF-Connecting-IP
  const cfIP = request.headers.get("CF-Connecting-IP");
  if (cfIP) return cfIP;

  // Fallback to other common headers
  const xForwardedFor = request.headers.get("X-Forwarded-For");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0].trim();
  }

  const xRealIP = request.headers.get("X-Real-IP");
  if (xRealIP) return xRealIP;

  // Fallback to "unknown" if detection fails
  return "unknown";
}

/**
 * Middleware helper to apply rate limiting
 *
 * @param request - Request object
 * @param config - Rate limit configuration
 * @param identifier - Custom identifier (default: client IP)
 * @returns Response with 429 error if blocked, null if allowed
 * 
 * @example
 * export const POST: APIRoute = async ({ request }) => {
 *   const rateLimitResponse = applyRateLimit(request, RATE_LIMITS.LOGIN);
 *   if (rateLimitResponse) return rateLimitResponse;
 *   
 *   // Process request normally...
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
