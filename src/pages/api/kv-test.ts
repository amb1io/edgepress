/**
 * Endpoint de teste do KV local (Wrangler/Miniflare).
 * GET /api/kv-test: escreve uma chave no KV, lê de volta e devolve o valor.
 * Se retornar "ok", o KV está funcionando.
 */
import type { APIRoute } from "astro";
import { getKvFromLocals } from "../../lib/utils/runtime-locals.ts";

export const prerender = false;

const TEST_KEY = "kv-test";
const TEST_VALUE = "ok";

export const GET: APIRoute = async ({ locals }) => {
  const kv = getKvFromLocals(locals);

  if (!kv) {
    return new Response(
      JSON.stringify({ ok: false, message: "KV (edgepress_cache) not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    await kv.put(TEST_KEY, TEST_VALUE);
    const value = await kv.get(TEST_KEY, "text");
    const ok = value === TEST_VALUE;
    return new Response(
      JSON.stringify({ ok, value: value ?? "null", message: ok ? "KV is working" : "KV read returned unexpected value" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "KV error";
    return new Response(
      JSON.stringify({ ok: false, message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
