/**
 * Logout via GET: limpa a sessão no servidor e redireciona para a tela de login.
 * Uso: link "Sair" com href="/api/logout?redirect=/{locale}/login"
 */
import type { APIRoute } from "astro";
import { auth } from "../../lib/auth.ts";
import { defaultLocale } from "../../i18n/index.ts";

export const prerender = false;

export const GET: APIRoute = async ({ request, redirect }) => {
  const url = new URL(request.url);
  const redirectTo =
    url.searchParams.get("redirect")?.trim() ||
    `/${defaultLocale}/login`;

  const origin = url.origin;
  const signOutRequest = new Request(`${origin}/api/auth/sign-out`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
    },
    body: "{}",
  });

  const authResponse = await auth.handler(signOutRequest);
  const headers = new Headers({ Location: redirectTo });

  const setCookies = authResponse.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      headers.append("Set-Cookie", cookie);
    }
  } else {
    const setCookie = authResponse.headers.get("Set-Cookie");
    if (setCookie) headers.append("Set-Cookie", setCookie);
  }

  return new Response(null, { status: 303, headers });
};
