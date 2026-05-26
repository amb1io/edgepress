import { auth } from "./utils/auth.ts";
import { defineMiddleware } from "astro:middleware";
import { defaultLocale } from "./i18n/index.ts";
import {
  getTrustedOrigins,
  isValidOrigin,
} from "./utils/csrf-protection.ts";
import { ensureTranslationsLoaded } from "./utils/i18n-helpers.ts";
import { db } from "./db/index.ts";
import {
  getActiveThemeSlugFromSettings,
  isSetupComplete,
} from "./core/services/settings-service.ts";
import { env as cfEnv } from "cloudflare:workers";
import { getKvFromLocals } from "./utils/runtime-locals.ts";

// Endpoints sensíveis que requerem validação extra de CSRF
const sensitiveAPIPaths = ["/api/posts", "/api/upload", "/api/media"];
const setupPath = `/setup/${defaultLocale}`;

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = new URL(context.request.url).pathname;
  const method = context.request.method.toUpperCase();

  const isApi = pathname.startsWith("/api");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isSetupApi = pathname === "/api/setup";

  // Permitir APIs de auth e setup mesmo quando setup não está completo
  if (isAuthApi || isSetupApi) {
    return next();
  }

  const setupDone = await isSetupComplete(db);

  const isSetupPage =
    pathname === setupPath ||
    pathname === "/setup" ||
    pathname.startsWith("/setup/");

  if (!setupDone) {
    if (!isSetupPage) {
      if (isApi) {
        return new Response(
          JSON.stringify({
            error: "setup_required",
            message: "Conclua a configuração inicial antes de continuar.",
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      return context.redirect(setupPath, 303);
    }
  } else if (isSetupPage) {
    return context.redirect("/login", 303);
  }

  // Links do menu admin usam /post?domain=... — redireciona para /admin/{locale}/post?...
  // antes do rewrite do tema público (senão abre /themes/2026/post sem layout admin).
  const hasAdminMenuQuery =
    context.url.searchParams.has("domain") || context.url.searchParams.has("page");
  if (!isApi && !pathname.startsWith("/admin/") && hasAdminMenuQuery) {
    const slug = pathname.replace(/^\/+|\/+$/g, "");
    if (slug && !slug.includes("/") && !pathname.startsWith("/themes/")) {
      return context.redirect(
        `/admin/${defaultLocale}/${slug}${context.url.search}`,
        303,
      );
    }
  }

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
    pathname.startsWith("/_") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap-index.xml" ||
    pathname.startsWith("/sitemap");

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
