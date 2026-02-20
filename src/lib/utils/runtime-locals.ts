/**
 * Helpers para acessar runtime e autenticação a partir de Astro locals (API routes).
 * Centraliza o tipo KVLike e o acesso a edgepress_cache, evitando casts repetidos.
 */

/** Tipo do cache KV (edgepress_cache). Compatível com App.KVLike em env.d.ts. */
export type KVLike = App.KVLike;

/**
 * Retorna a instância do KV (edgepress_cache) dos locals, ou null se não disponível.
 */
export function getKvFromLocals(locals: App.Locals): KVLike | null {
  return locals.runtime?.env?.edgepress_cache ?? null;
}

/**
 * Retorna true se o usuário está autenticado (locals.user presente).
 */
export function isAuthenticatedFromLocals(locals: App.Locals): boolean {
  return Boolean(locals.user);
}

/**
 * Retorna o KV para uso em cache: disponível apenas quando o usuário não está autenticado.
 * Autenticado: bypass de cache (retorna null). Não autenticado: retorna o KV quando existir.
 */
export function getCacheKvFromLocals(locals: App.Locals): KVLike | null {
  return isAuthenticatedFromLocals(locals) ? null : getKvFromLocals(locals);
}
