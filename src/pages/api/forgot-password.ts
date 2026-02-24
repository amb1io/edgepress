import { auth } from "../../lib/auth.ts";
import type { APIRoute } from "astro";
import { defaultLocale } from "../../i18n/index.ts";
import { getString } from "../../lib/utils/form-data.ts";

const LOCALES = ["pt-br", "en", "es"];

function getLocaleFromRequest(request: Request, formLocale?: string | null): string {
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
  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
    return redirect(`/${defaultLocale}/login`, 303);
  }

  const formData = await request.formData();
  const email = getString(formData, "email");
  const locale = getLocaleFromRequest(request, getString(formData, "locale") || undefined);

  const forgotPath = `/${locale}/login/forgot-password`;

  if (!email) {
    return redirect(`${forgotPath}?error=missing_email`, 303);
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const redirectTo = `${origin}/${locale}/login/reset-password`;
  const authPath = "/api/auth/request-password-reset";

  const authRequest = new Request(`${origin}${authPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({
      email,
      redirectTo,
    }),
  });

  try {
    const authResponse = await auth.handler(authRequest);
    const _data = await authResponse.json().catch(() => ({}));
    // Always redirect successfully to avoid revealing whether the email exists
    return redirect(`${forgotPath}?sent=1`, 303);
  } catch (err) {
    console.error("Forgot password error:", err);
    return redirect(`${forgotPath}?sent=1`, 303);
  }
};
