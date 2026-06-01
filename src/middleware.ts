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
const FALLBACK_THEME_SLUG = "2026";
const DEFAULT_PUBLIC_THEME_LOCALE = "pt_BR";
const DEFAULT_ADMIN_LOCALE = "pt-br";

function normalizePublicThemeLocale(
  rawLocale: string | null | undefined,
): "pt_BR" | "en_US" | "es_ES" | null {
  const value = String(rawLocale ?? "").trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (value === "pt_BR" || lower === "pt-br" || lower === "pt_br" || lower === "pt") {
    return "pt_BR";
  }
  if (value === "en_US" || lower === "en-us" || lower === "en_us" || lower === "en") {
    return "en_US";
  }
  if (value === "es_ES" || lower === "es-es" || lower === "es_es" || lower === "es") {
    return "es_ES";
  }
  return null;
}

function normalizeAdminUrlLocale(
  rawLocale: string | null | undefined,
): "pt-br" | "es" | "en" | null {
  const value = String(rawLocale ?? "").trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  if (value === "pt_BR" || lower === "pt_br" || lower === "pt-br" || lower === "pt") {
    return "pt-br";
  }
  if (value === "es_ES" || lower === "es_es" || lower === "es-es" || lower === "es") {
    return "es";
  }
  if (value === "en_US" || lower === "en_us" || lower === "en-us" || lower === "en") {
    return "en";
  }
  return null;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = new URL(context.request.url).pathname;
  const method = context.request.method.toUpperCase();
  const themeRootMatch = pathname.match(/^\/themes\/([^/]+)\/?$/);
  const adminLocaleMatch = pathname.match(/^\/admin\/([^/]+)(\/.*)?$/);

  const isApi = pathname.startsWith("/api");
  const isAuthApi = pathname.startsWith("/api/auth");
  const isSetupApi = pathname === "/api/setup";

  // Admin aceita apenas locale de URL (pt-br|es|en).
  // Ex.: /admin/pt_BR/list -> /admin/pt-br/list
  if (adminLocaleMatch) {
    const [, rawLocale, suffix = ""] = adminLocaleMatch;
    const normalizedAdminLocale = normalizeAdminUrlLocale(rawLocale);
    if (normalizedAdminLocale && rawLocale !== normalizedAdminLocale) {
      return context.redirect(
        `/admin/${normalizedAdminLocale}${suffix}${context.url.search}`,
        303,
      );
    }
    if (!normalizedAdminLocale) {
      return context.redirect(
        `/admin/${DEFAULT_ADMIN_LOCALE}${suffix}${context.url.search}`,
        303,
      );
    }
  }

  // /themes/{slug} sem locale é reescrito internamente para o locale padrão.
  // Ex.: /themes/2026 -> /themes/2026/pt_BR
  if (themeRootMatch) {
    return next(`/themes/${themeRootMatch[1]}/${DEFAULT_PUBLIC_THEME_LOCALE}`);
  }

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
    const activeSlugFromDb = await getActiveThemeSlugFromSettings(db, {
      kv,
      isAuthenticated: Boolean(locals.user),
    });

    const activeSlug = (activeSlugFromDb ?? "").trim() || FALLBACK_THEME_SLUG;
    let outPath = pathname;
    if (outPath.length > 1 && outPath.endsWith("/")) {
      outPath = outPath.replace(/\/+$/, "");
    }
    const targetPath =
      outPath === "/"
        ? `/themes/${activeSlug}/${DEFAULT_PUBLIC_THEME_LOCALE}`
        : `/themes/${activeSlug}${outPath}`;
    // next(path) em vez de context.rewrite(Request): evita SpanParent / I/O cross-request no workerd dev.
    return next(`${targetPath}${context.url.search}`);
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
    const publicMatch = pathname.match(/^\/([^/]+)(\/|$)/);
    const adminMatch = pathname.match(/^\/admin\/([^/]+)(\/|$)/);
    const themeMatch = pathname.match(/^\/themes\/[^/]+\/([^/]+)(\/|$)/);
    const localeToLoad =
      (publicMatch && normalizePublicThemeLocale(publicMatch[1])) ||
      (adminMatch && normalizePublicThemeLocale(adminMatch[1])) ||
      (themeMatch && normalizePublicThemeLocale(themeMatch[1]));

    if (localeToLoad) {
      await ensureTranslationsLoaded(localeToLoad);
    }
  }

  return next();
});
