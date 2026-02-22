/**
 * API de conclusão do setup inicial.
 * POST: aplica migrações se necessário (cria tabelas se não existirem), cria o primeiro usuário (better-auth),
 * atualiza site_name, site_description e seta setup_done=Y.
 * O seed do banco deve ser executado apenas via npm (ex.: npm run db:seed).
 */
import type { APIRoute } from "astro";
import { auth } from "../../lib/auth.ts";
import { db } from "../../db/index.ts";
import { settings as settingsTable } from "../../db/schema.ts";
import { eq } from "drizzle-orm";
import { getString } from "../../lib/utils/form-data.ts";
import { sanitizeCallbackURL } from "../../lib/utils/url-validator.ts";
import { badRequestHtmlResponse, htmxRedirectResponse } from "../../lib/utils/http-responses.ts";

export const prerender = false;

const SETUP_ERROR_MESSAGES: Record<string, string> = {
  invalid_request: "Requisição inválida. Use o formulário para enviar os dados.",
  missing_fields: "Preencha todos os campos obrigatórios: nome, email e senha.",
  password_too_short: "A senha deve ter no mínimo 8 caracteres.",
  signup_failed: "Não foi possível criar o usuário. Tente novamente ou use outro email.",
  email_already_exists: "Este email já está em uso.",
};

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get("content-type") ?? "";
  const isHtmx = request.headers.get("HX-Request") === "true";
  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    if (isHtmx) return badRequestHtmlResponse(SETUP_ERROR_MESSAGES.invalid_request);
    return redirect("/setup?error=invalid_request", 303);
  }

  const formData = await request.formData();
  const name = getString(formData, "name");
  const email = getString(formData, "email");
  const password = (formData.get("password") as string) ?? "";
  const siteName = getString(formData, "site_name");
  const siteDescription = getString(formData, "site_description");

  if (!name || !email || !password) {
    if (isHtmx) return badRequestHtmlResponse(SETUP_ERROR_MESSAGES.missing_fields);
    return redirect("/setup?error=missing_fields", 303);
  }
  if (password.length < 8) {
    if (isHtmx) return badRequestHtmlResponse(SETUP_ERROR_MESSAGES.password_too_short);
    return redirect("/setup?error=password_too_short", 303);
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const locale = "pt-br";
  const defaultCallback = `/${locale}/admin`;
  const safeCallbackURL = sanitizeCallbackURL(
    defaultCallback,
    origin,
    defaultCallback,
  );

  const authRequest = new Request(`${origin}/api/auth/sign-up/email`, {
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
      role: 0,
      callbackURL: safeCallbackURL,
    }),
  });

  const authResponse = await auth.handler(authRequest);
  if (!authResponse.ok) {
    const errData = (await authResponse.json().catch(() => ({}))) as { code?: string };
    const code = errData?.code ?? "signup_failed";
    const message = SETUP_ERROR_MESSAGES[code] ?? SETUP_ERROR_MESSAGES.signup_failed;
    if (isHtmx) return badRequestHtmlResponse(message);
    return redirect(`/setup?error=${encodeURIComponent(code)}`, 303);
  }

  await db
    .update(settingsTable)
    .set({ value: siteName || "demo site" })
    .where(eq(settingsTable.name, "site_name"));
  await db
    .update(settingsTable)
    .set({ value: siteDescription || "demo_description" })
    .where(eq(settingsTable.name, "site_description"));
  await db
    .update(settingsTable)
    .set({ value: "Y" })
    .where(eq(settingsTable.name, "setup_done"));

  const loginUrl = `/${locale}/login?setup=success`;
  const setCookie = "setup_done=Y; Path=/; HttpOnly; SameSite=Lax";
  if (isHtmx) {
    const res = htmxRedirectResponse(loginUrl);
    res.headers.set("Set-Cookie", setCookie);
    return res;
  }
  const response = redirect(loginUrl, 303);
  response.headers.set("Set-Cookie", setCookie);
  return response;
};
