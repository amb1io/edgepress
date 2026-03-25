/**
 * Vitest runs in Node: the real `cloudflare:workers` module is unavailable.
 * Vitest resolves `cloudflare:workers` here (see vitest.config.ts).
 */
export const env: Record<string, unknown> = {};
