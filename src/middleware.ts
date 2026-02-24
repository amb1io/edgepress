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

const protectedPaths = ["/admin"];
const authPaths = ["/login"];
const setupPath = `/${defaultLocale}/setup`;

// Sensitive endpoints that require extra CSRF validation
const sensitiveAPIPaths = ["/api/posts", "/api/upload", "/api/media"];

/**
 * Checks whether the initial setup has been completed.
 * First checks the "setup_done" cookie (equivalent to session storage);
 * if not found, queries the database.
 * Returns false if: the cookie is not "Y" and the DB is not configured,
 * the settings table does not exist, or setup_done is not "Y".
 * In those cases the user should be redirected to /setup.
 */
async function isSetupDone(request: Request): Promise<boolean> {
  // First check the cookie (equivalent to session storage)
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

  // If not found in the cookie, query the database
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

  // Allow auth and setup APIs even when setup is not complete
  // These APIs are required to complete the initial setup
  // Call next() before checking setup to ensure the route is resolved
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

  // CSRF validation for sensitive endpoints (POST/PUT/DELETE/PATCH)
  const isSensitiveAPI = sensitiveAPIPaths.some((p) => pathname.startsWith(p));
  const isWriteMethod = ["POST", "PUT", "DELETE", "PATCH"].includes(method);

  if (isSensitiveAPI && isWriteMethod) {
    // Get trusted origins from the environment
    const env = (
      context.locals as { runtime?: { env?: Record<string, unknown> } }
    ).runtime?.env as
      | { BETTER_AUTH_URL?: string; BETTER_AUTH_TRUSTED_ORIGINS?: string }
      | undefined;

    const trustedOrigins = env
      ? getTrustedOrigins(env)
      : ["http://localhost:8788"];

    // Validate origin
    if (!isValidOrigin(context.request, trustedOrigins)) {
      return new Response(
        JSON.stringify({
          error: "forbidden",
          message: "Untrusted origin",
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

  // Preload translations (DB + JSON fallback) for [locale] routes so t() uses the database
  const localeMatch = pathname.match(/^\/(en|es|pt-br)(\/|$)/);
  if (!isApi && localeMatch) {
    await ensureTranslationsLoaded(localeMatch[1]);
  }

  return next();
});
