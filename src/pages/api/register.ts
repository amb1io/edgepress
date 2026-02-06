/**
 * API de cadastro de usuário via better-auth (email + password).
 * @see https://www.better-auth.com/docs/authentication/email-password
 */
import { auth } from "../../lib/auth.ts";
import { USER_ROLE_IDS } from "../../db/schema.ts";
import type { APIRoute } from "astro";
import { applyRateLimit, getRateLimits } from "../../lib/utils/rate-limiter.ts";
import { sanitizeCallbackURL } from "../../lib/utils/url-validator.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  // Obter rate limits do ambiente (locals pode ser undefined em testes ou SSR)
  const env = (locals as { runtime?: { env?: Record<string, string> } } | undefined)?.runtime?.env;
  const rateLimits = getRateLimits(env);

  // Aplicar rate limiting: configurável via env (padrão: 3 registros / hora)
  const rateLimitResponse = applyRateLimit(request, rateLimits.REGISTER);
  if (rateLimitResponse) {
    return redirect("/?error=rate_limit_exceeded", 303);
  }
  const contentType = request.headers.get("content-type") ?? "";
  let name: string;
  let email: string;
  let password: string;
  let image: string | undefined;
  let role: string | undefined; // form sends string "0".."3"
  let callbackURL: string | undefined;
  let locale: string | undefined;

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    name = (formData.get("name") as string)?.trim() ?? "";
    email = (formData.get("email") as string)?.trim() ?? "";
    password = (formData.get("password") as string) ?? "";
    image = (formData.get("image") as string)?.trim() || undefined;
    role = (formData.get("role") as string)?.trim() || undefined;
    callbackURL = (formData.get("callbackURL") as string)?.trim() || undefined;
    locale = (formData.get("locale") as string)?.trim() || undefined;
  } else {
    return redirect(`/${locale || "pt-br"}/admin/content?post_type=user&action=new&error=invalid_request`, 303);
  }

  if (!name || !email || !password) {
    return redirect(
      `/${locale || "pt-br"}/admin/content?post_type=user&action=new&error=missing_fields`,
      303
    );
  }

  if (password.length < 8) {
    return redirect(
      `/${locale || "pt-br"}/admin/content?post_type=user&action=new&error=password_too_short`,
      303
    );
  }

  const roleNum = role !== undefined && role !== "" ? parseInt(role, 10) : NaN;
  const roleValue = Number.isNaN(roleNum) || !USER_ROLE_IDS.includes(roleNum as (typeof USER_ROLE_IDS)[number])
    ? 3
    : roleNum; // 3 = leitor

  const url = new URL(request.url);
  const origin = url.origin;
  const authPath = "/api/auth/sign-up/email";

  // Sanitizar e validar callbackURL para prevenir Open Redirect
  const defaultCallback = `/${locale || "pt-br"}/admin/list?type=user&limit=10&page=1`;
  const safeCallbackURL = sanitizeCallbackURL(callbackURL, origin, defaultCallback);

  const authRequest = new Request(`${origin}${authPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: origin,
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({
      name,
      email,
      password,
      ...(image && { image }),
      role: roleValue, // Sempre enviar role, mesmo que seja o padrão
      callbackURL: safeCallbackURL,
    }),
  });

  const authResponse = await auth.handler(authRequest);

  if (!authResponse.ok) {
    const errData = await authResponse.json().catch(() => ({}));
    const errorText = await authResponse.text().catch(() => "Unknown error");
    const code = errData?.code ?? "signup_failed";
    console.error("Registration failed:", {
      email,
      name,
      role: roleValue,
      status: authResponse.status,
      error: errorText,
      errData,
    });
    return redirect(
      `/${locale || "pt-br"}/admin/content?post_type=user&action=new&error=${encodeURIComponent(code)}`,
      303
    );
  }
  
  // Log de sucesso para debug
  console.log("Registration successful:", {
    email,
    name,
    role: roleValue,
  });

  const data = await authResponse.json().catch(() => ({}));
  const location = data?.url ?? `/${locale || "pt-br"}/admin/list?type=user&limit=10&page=1`;

  const responseHeaders = new Headers({ Location: location });
  const cookies = authResponse.headers.getSetCookie?.() ?? [];
  if (cookies.length > 0) {
    for (const cookie of cookies) {
      responseHeaders.append("Set-Cookie", cookie);
    }
  } else {
    const setCookie = authResponse.headers.get("set-cookie");
    if (setCookie) responseHeaders.append("Set-Cookie", setCookie);
  }

  return new Response(null, {
    status: 303,
    headers: responseHeaders,
  });
};
