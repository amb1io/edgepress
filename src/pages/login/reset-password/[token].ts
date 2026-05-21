/**
 * Redireciona o link do email (baseURL/reset-password/TOKEN?callbackURL=...)
 * para o handler do better-auth que valida o token e redireciona para a página de redefinição.
 */
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ params, request, redirect }) => {
  const token = params.token;
  if (!token) return redirect("/pt-br/login", 302);
  const url = new URL(request.url);
  const callbackURL = url.searchParams.get("callbackURL");
  const origin = url.origin;
  const authPath = `/api/auth/reset-password/${encodeURIComponent(token)}`;
  const query = callbackURL ? `?callbackURL=${encodeURIComponent(callbackURL)}` : "";
  return redirect(`${origin}${authPath}${query}`, 302);
};
