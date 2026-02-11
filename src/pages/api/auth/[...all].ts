import { auth } from "../../../lib/auth.ts";
import type { APIRoute } from "astro";

export const prerender = false;

export const ALL: APIRoute = async (ctx) => {
  try {
    const response = await auth.handler(ctx.request);
    return response;
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "internal_error",
        message: "Erro ao processar requisição de autenticação",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
