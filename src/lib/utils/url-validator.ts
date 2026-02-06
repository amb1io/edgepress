/**
 * Utilitários para validação e sanitização de URLs
 * Previne vulnerabilidades de Open Redirect
 */

/**
 * Valida se uma URL de callback pertence ao mesmo domínio
 * 
 * @param url - URL de callback a ser validada
 * @param baseURL - URL base da aplicação
 * @returns true se a URL é válida e segura
 * 
 * @example
 * isValidCallbackURL("/admin", "http://localhost:8788") // true
 * isValidCallbackURL("http://localhost:8788/admin", "http://localhost:8788") // true
 * isValidCallbackURL("http://evil.com/steal", "http://localhost:8788") // false
 */
export function isValidCallbackURL(url: string, baseURL: string): boolean {
  // URLs vazias ou undefined retornam false
  if (!url || url.trim() === "") {
    return false;
  }

  try {
    // Se for um path relativo (começa com /), é válido
    if (url.startsWith("/")) {
      // Prevenir double-slash redirects (//evil.com)
      if (url.startsWith("//")) {
        return false;
      }
      return true;
    }

    // Se for URL absoluta, validar origem
    const callback = new URL(url);
    const base = new URL(baseURL);
    
    // Deve ter a mesma origem (protocol + host + port)
    return callback.origin === base.origin;
  } catch {
    // URL inválida retorna false
    return false;
  }
}

/**
 * Sanitiza uma URL de callback, retornando um fallback seguro se inválida
 * 
 * @param url - URL de callback a ser sanitizada
 * @param baseURL - URL base da aplicação
 * @param fallback - URL de fallback caso a validação falhe (padrão: "/admin")
 * @returns URL sanitizada
 * 
 * @example
 * sanitizeCallbackURL("/pt-br/admin", "http://localhost:8788") // "/pt-br/admin"
 * sanitizeCallbackURL("http://evil.com", "http://localhost:8788") // "/admin"
 * sanitizeCallbackURL("", "http://localhost:8788", "/home") // "/home"
 */
export function sanitizeCallbackURL(
  url: string | undefined,
  baseURL: string,
  fallback = "/admin"
): string {
  if (!url) {
    return fallback;
  }

  if (isValidCallbackURL(url, baseURL)) {
    return url;
  }

  return fallback;
}

/**
 * Whitelist de paths permitidos para callbacks
 * Usado para validação extra de segurança
 */
const ALLOWED_CALLBACK_PATHS = [
  "/admin",
  "/pt-br/admin",
  "/en/admin",
  "/es/admin",
] as const;

/**
 * Valida se um path está na whitelist de callbacks permitidos
 * 
 * @param path - Path a ser validado
 * @returns true se o path está na whitelist ou começa com um path permitido
 * 
 * @example
 * isAllowedCallbackPath("/admin") // true
 * isAllowedCallbackPath("/pt-br/admin/content") // true
 * isAllowedCallbackPath("/public/page") // false
 */
export function isAllowedCallbackPath(path: string): boolean {
  if (!path || !path.startsWith("/")) {
    return false;
  }

  // Prevenir double-slash
  if (path.startsWith("//")) {
    return false;
  }

  return ALLOWED_CALLBACK_PATHS.some((allowed) =>
    path === allowed || path.startsWith(`${allowed}/`)
  );
}

/**
 * Valida callback URL com whitelist extra
 * Combina validação de origem e whitelist de paths
 * 
 * @param url - URL de callback a ser validada
 * @param baseURL - URL base da aplicação
 * @returns true se a URL é válida e está na whitelist
 */
export function isValidAndAllowedCallbackURL(
  url: string | undefined,
  baseURL: string
): boolean {
  if (!url) {
    return false;
  }

  // Primeiro valida a origem
  if (!isValidCallbackURL(url, baseURL)) {
    return false;
  }

  // Se for path relativo, valida whitelist
  if (url.startsWith("/")) {
    return isAllowedCallbackPath(url);
  }

  // Se for URL absoluta, extrai o path e valida
  try {
    const parsed = new URL(url);
    return isAllowedCallbackPath(parsed.pathname);
  } catch {
    return false;
  }
}
