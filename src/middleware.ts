import { auth } from "./lib/auth.ts";
import { defineMiddleware } from "astro:middleware";
import { defaultLocale } from "./i18n/index.ts";
import {
  getTrustedOrigins,
  isValidOrigin,
} from "./lib/utils/csrf-protection.ts";
import { ensureTranslationsLoaded } from "./lib/i18n-helpers.ts";
import { db } from "./db/index.ts";
import { settings as settingsTable } from "./db/schema.ts";
import { eq } from "drizzle-orm";
import { env as cfEnv } from "cloudflare:workers";
import { getKvFromLocals } from "./lib/utils/runtime-locals.ts";
import { getActiveThemeSlugFromSettings } from "./lib/services/settings-service.ts";

// Endpoints sensíveis que requerem validação extra de CSRF
const sensitiveAPIPaths = ["/api/posts", "/api/upload", "/api/media"];
const authPaths = ["/login"];
const setupPath = `/setup/${defaultLocale}`;

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

  const isApi = pathname.startsWith("/api");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isSetupApi = pathname === "/api/setup";

  // URLs públicas não devem expor /themes/* (rota interna).
  // Quando acessado publicamente, reescrevemos internamente a mesma URL
  // adicionando `x-edgepress-internal-rewrite: 1` para evitar loops.
  if (!isApi && pathname.startsWith("/themes/")) {
    if (context.request.headers.get("x-edgepress-internal-rewrite") === "1") {
      return next();
    }

    const url = new URL(context.request.url);
    const headers = new Headers(context.request.headers);
    headers.set("x-edgepress-internal-rewrite", "1");
    return context.rewrite(new Request(url, { headers }));
  }

  // Permitir APIs de auth e setup mesmo quando setup não está completo
  // Essas APIs são necessárias para completar o setup inicial
  // Chamar next() antes de verificar setup para garantir que a rota seja encontrada
  if (isAuthApi || isSetupApi) {
    const response = await next();
    return response;
  }

  // Site público: tudo que não é admin, login, setup ou API reescreve internamente
  // para /themes/{active_theme}/... usando o setting `active_theme` no banco.
  // Ex.: /quem-somos → /themes/farramedia/quem-somos (mantém a URL no browser).
  const skipActiveThemeRewrite =
    isApi ||
    pathname.startsWith("/themes/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/setup" ||
    pathname.startsWith("/setup/") ||
    pathname.startsWith("/.well-known/") ||
    pathname === "/.well-known" ||
    pathname.startsWith("/@") ||
    pathname.startsWith("/_");

  if (!skipActiveThemeRewrite) {
    const locals = context.locals as App.Locals;
    const kv = getKvFromLocals(locals);
    const activeSlug = await getActiveThemeSlugFromSettings(db, {
      kv,
      isAuthenticated: Boolean(locals.user),
    });

    if (activeSlug) {
      const url = new URL(context.request.url);
      let outPath = pathname;
      if (outPath.length > 1 && outPath.endsWith("/")) {
        outPath = outPath.replace(/\/+$/, "");
      }
      url.pathname =
        outPath === "/" ? `/themes/${activeSlug}` : `/themes/${activeSlug}${outPath}`;
      const headers = new Headers(context.request.headers);
      headers.set("x-edgepress-internal-rewrite", "1");
      return context.rewrite(new Request(url, { headers }));
    }
  }

  const setupDone = await isSetupDone(context.request);

  const isSetupPage = pathname === setupPath;
  const isLoginPage = authPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Lógica de setup:
  // - Se setup JÁ foi concluído e o usuário tenta acessar /{locale}/setup, redireciona para /admin/{locale}.
  // - Se setup AINDA NÃO foi concluído, qualquer rota não-API e diferente de /setup (e não /login)
  //   redireciona para a página de setup.
  if (!isApi && !isLoginPage) {
    if (isSetupPage && setupDone) {
      // return context.redirect(`/admin/${defaultLocale}`);
    }
    if (!isSetupPage && !setupDone) {
      return context.redirect(setupPath, 303);
    }
  }

  // Validação CSRF para endpoints sensíveis (POST/PUT/DELETE/PATCH)
  const isSensitiveAPI = sensitiveAPIPaths.some((p) => pathname.startsWith(p));
  const isWriteMethod = ["POST", "PUT", "DELETE", "PATCH"].includes(method);

  if (isSensitiveAPI && isWriteMethod) {
    const trustedOrigins = getTrustedOrigins({
      BETTER_AUTH_URL: cfEnv.BETTER_AUTH_URL,
      BETTER_AUTH_TRUSTED_ORIGINS: cfEnv.BETTER_AUTH_TRUSTED_ORIGINS,
    });

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

  // Regra: ao acessar /admin (e subrotas), exigir usuário logado
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  if (!isApi && isAdminRoute && !context.locals.session) {
    return context.redirect("/login", 303);
  }

  // Pré-carregar traduções (DB + fallback JSON) para rotas com locale,
  // suportando tanto /{locale}/... (site público) quanto /admin/{locale}/... (admin).
  if (!isApi) {
    const publicMatch = pathname.match(/^\/(en|es|pt-br)(\/|$)/);
    const adminMatch = pathname.match(/^\/admin\/(en|es|pt-br)(\/|$)/);
    const localeToLoad =
      (publicMatch && (publicMatch[1] as "en" | "es" | "pt-br")) ||
      (adminMatch && (adminMatch[1] as "en" | "es" | "pt-br"));

    if (localeToLoad) {
      await ensureTranslationsLoaded(localeToLoad);
    }
  }

  return next();
});
