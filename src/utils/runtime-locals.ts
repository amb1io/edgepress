/**
 * Helpers para autenticação e KV no Worker (Astro 6 + Cloudflare: use `env` de cloudflare:workers).
 * O parâmetro `locals` permanece para compatibilidade de chamadas; o KV vem sempre do binding Worker.
 */

import { env as cfEnv } from "cloudflare:workers";

/** Tipo do cache KV (edgepress_cache). Compatível com App.KVLike em env.d.ts. */
export type KVLike = App.KVLike;

/**
 * Retorna a instância do KV (edgepress_cache), ou null se não disponível.
 */
export function getKvFromLocals(_locals: App.Locals): KVLike | null {
  const kv = cfEnv.edgepress_cache;
  return kv != null ? (kv as unknown as KVLike) : null;
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
