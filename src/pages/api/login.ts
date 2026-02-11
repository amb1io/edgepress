import { auth } from "../../lib/auth.ts";
import type { APIRoute } from "astro";
import { defaultLocale } from "../../i18n/index.ts";
// import { applyRateLimit, getRateLimits } from "../../lib/utils/rate-limiter.ts";
import { sanitizeCallbackURL } from "../../lib/utils/url-validator.ts";

const LOCALES = ["pt-br", "en", "es"];

function getLocaleFromRequest(request: Request, formLocale?: string | null | undefined): string {
  if (formLocale && LOCALES.includes(formLocale)) return formLocale;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const path = new URL(referer).pathname;
      const match = path.match(/^\/(pt-br|en|es)\//) || path.match(/^\/(pt-br|en|es)$/);
      if (match?.[1]) return match[1];
    } catch {
      /* ignore */
    }
  }
  return defaultLocale;
}

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get("content-type") ?? "";
  let email: string;
  let password: string;
  let callbackURL: string | undefined;
  let locale: string;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    email = (formData.get("email") as string)?.trim() ?? "";
    password = (formData.get("password") as string) ?? "";
    callbackURL = (formData.get("callbackURL") as string)?.trim() || undefined;
    locale = getLocaleFromRequest(request, (formData.get("locale") as string) || undefined);
  } else {
    locale = getLocaleFromRequest(request);
    return redirect(`/${locale}/login?error=invalid_request`, 303);
  }

  const loginPath = `/${locale}/login`;

  if (!email || !password) {
    return redirect(`${loginPath}?error=missing_fields`, 303);
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const authPath = "/api/auth/sign-in/email";

  // Sanitizar e validar callbackURL para prevenir Open Redirect
  const safeCallbackURL = sanitizeCallbackURL(callbackURL, origin, "/admin");

  const authRequest = new Request(`${origin}${authPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: origin,
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({
      email,
      password,
      callbackURL: safeCallbackURL,
    }),
  });

  try {
    const authResponse = await auth.handler(authRequest);

    if (!authResponse.ok) {
      // Log do erro para debug
      const errorText = await authResponse.text().catch(() => "Unknown error");
      const errorStatus = authResponse.status;
      console.error("Login failed:", {
        email,
        status: errorStatus,
        error: errorText,
        url: authRequest.url,
      });
      return redirect(`${loginPath}?error=invalid_credentials`, 303);
    }

    const data = (await authResponse.json().catch(() => ({}))) as {
      url?: string;
    };
    const location = data.url ?? safeCallbackURL;

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
  } catch (err) {
    console.error("Login error:", err);
    const locale = getLocaleFromRequest(request);
    return redirect(`/${locale}/login?error=invalid_credentials`, 303);
  }
};
