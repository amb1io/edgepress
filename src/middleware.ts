import { auth } from "./lib/auth.ts";
import { defineMiddleware } from "astro:middleware";
import { defaultLocale } from "./i18n/index.ts";
import { getTrustedOrigins, isValidOrigin } from "./lib/utils/csrf-protection.ts";

const protectedPaths = ["/admin"];
const authPaths = ["/login"];

// Endpoints sensíveis que requerem validação extra de CSRF
const sensitiveAPIPaths = ["/api/posts", "/api/upload", "/api/media"];

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = new URL(context.request.url).pathname;
  const method = context.request.method.toUpperCase();

  // Validação CSRF para endpoints sensíveis (POST/PUT/DELETE/PATCH)
  const isSensitiveAPI = sensitiveAPIPaths.some((p) => pathname.startsWith(p));
  const isWriteMethod = ["POST", "PUT", "DELETE", "PATCH"].includes(method);

  if (isSensitiveAPI && isWriteMethod) {
    // Obter origens confiáveis do ambiente
    const env = (context.locals as { runtime?: { env?: Record<string, unknown> } })
      .runtime?.env as { BETTER_AUTH_URL?: string; BETTER_AUTH_TRUSTED_ORIGINS?: string } | undefined;
    
    const trustedOrigins = env ? getTrustedOrigins(env) : ["http://localhost:8788"];

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
        }
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

  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isLocaleProtected = /^\/(en|es|pt-br)\/admin/.test(pathname);
  const isAuthPage = authPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  if ((isProtected || isLocaleProtected) && !session) {
    return context.redirect("/login");
  }

  if (isAuthPage && session) {
    return context.redirect(`/${defaultLocale}/admin`);
  }

  return next();
});
