import { auth } from "./lib/auth.ts";
import { defineMiddleware } from "astro:middleware";
import { defaultLocale } from "./i18n/index.ts";
import {
  getTrustedOrigins,
  isValidOrigin,
} from "./lib/utils/csrf-protection.ts";
import { db } from "./db/index.ts";
import { settings as settingsTable } from "./db/schema.ts";
import { eq } from "drizzle-orm";

const protectedPaths = ["/admin"];
const authPaths = ["/login"];
const setupPath = `/${defaultLocale}/setup`;

// Endpoints sensíveis que requerem validação extra de CSRF
const sensitiveAPIPaths = ["/api/posts", "/api/upload", "/api/media"];

/**
 * Verifica se o setup inicial já foi concluído.
 * Primeiro verifica o cookie "setup_done" (equivalente ao session storage),
 * se não encontrar, consulta o banco de dados.
 * Retorna false se: o cookie não for "Y" e o banco não estiver configurado,
 * a tabela settings não existir, ou setup_done não for "Y".
 * Nesses casos o usuário deve ser redirecionado para /setup.
 */
async function isSetupDone(request: Request): Promise<boolean> {
  // Primeiro verifica o cookie (equivalente ao session storage)
  const cookies = request.headers.get("cookie") ?? "";
  const setupDoneCookie = cookies
    .split(";")
    .find((c) => c.trim().startsWith("setup_done="));
  if (setupDoneCookie) {
    const value = setupDoneCookie.split("=")[1]?.trim();
    if (value === "Y") {
      return true;
    }
  }

  // Se não encontrar no cookie, consulta o banco de dados
  try {
    const rows = await db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.name, "setup_done"))
      .limit(1);
    return rows[0]?.value === "Y";
  } catch {
    return false;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = new URL(context.request.url).pathname;
  const method = context.request.method.toUpperCase();

  const isSetupPage = pathname === setupPath;
  const isApi = pathname.startsWith("/api");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isSetupApi = pathname === "/api/setup";
  const isLoginPage = authPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Permitir APIs de auth e setup mesmo quando setup não está completo
  // Essas APIs são necessárias para completar o setup inicial
  // Chamar next() antes de verificar setup para garantir que a rota seja encontrada
  if (isAuthApi || isSetupApi) {
    const response = await next();
    return response;
  }

  const setupDone = await isSetupDone(context.request);

  if (!isApi && !isLoginPage) {
    if (isSetupPage && setupDone) {
      return context.redirect(`/${defaultLocale}/admin`);
    }
    if (!isSetupPage && !setupDone) {
      return context.redirect(setupPath, 303);
    }
  }

  // Validação CSRF para endpoints sensíveis (POST/PUT/DELETE/PATCH)
  const isSensitiveAPI = sensitiveAPIPaths.some((p) => pathname.startsWith(p));
  const isWriteMethod = ["POST", "PUT", "DELETE", "PATCH"].includes(method);

  if (isSensitiveAPI && isWriteMethod) {
    // Obter origens confiáveis do ambiente
    const env = (
      context.locals as { runtime?: { env?: Record<string, unknown> } }
    ).runtime?.env as
      | { BETTER_AUTH_URL?: string; BETTER_AUTH_TRUSTED_ORIGINS?: string }
      | undefined;

    const trustedOrigins = env
      ? getTrustedOrigins(env)
      : ["http://localhost:8788"];

    // Validar origem
    if (!isValidOrigin(context.request, trustedOrigins)) {
      return new Response(
        JSON.stringify({
          error: "forbidden",
          message: "Origem não confiável",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  // Redirect /admin and /admin/* to default locale admin (e.g. /pt-br/admin)
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const rest =
      pathname === "/admin"
        ? "admin"
        : pathname.replace(/^\/admin\/?/, "admin/");
    const newPath =
      `/${defaultLocale}/${rest}`.replace(/\/$/, "") ||
      `/${defaultLocale}/admin`;
    const search = new URL(context.request.url).search;
    return context.redirect(newPath + search);
  }

  if (!setupDone) {
    context.locals.user = null;
    context.locals.session = null;
  } else {
    const session = await auth.api.getSession({
      headers: context.request.headers,
    });
    if (session) {
      context.locals.user = session.user;
      context.locals.session = session.session;
    } else {
      context.locals.user = null;
      context.locals.session = null;
    }
  }

  const session = context.locals.session
    ? { user: context.locals.user!, session: context.locals.session }
    : null;

  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isLocaleProtected = /^\/(en|es|pt-br)\/admin/.test(pathname);
  const isAuthPage = authPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if ((isProtected || isLocaleProtected) && !session) {
    return context.redirect(`/${defaultLocale}/login`);
  }

  if (isAuthPage && session) {
    return context.redirect(`/${defaultLocale}/admin`);
  }

  return next();
});
