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
  const token = getString(formData, "token");
  const newPassword = getString(formData, "newPassword");
  const confirmPassword = getString(formData, "confirmPassword");
  const locale = getLocaleFromRequest(request, getString(formData, "locale") || undefined);

  const resetPath = `/${locale}/login/reset-password`;
  const loginPath = `/${locale}/login`;

  if (!token) {
    return redirect(`${resetPath}?error=invalid_token`, 303);
  }
  if (!newPassword || newPassword.length < 8) {
    return redirect(`${resetPath}?token=${encodeURIComponent(token)}&error=password_too_short`, 303);
  }
  if (newPassword !== confirmPassword) {
    return redirect(`${resetPath}?token=${encodeURIComponent(token)}&error=password_mismatch`, 303);
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const authPath = "/api/auth/reset-password";

  const authRequest = new Request(`${origin}${authPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({
      newPassword,
      token,
    }),
  });

  try {
    const authResponse = await auth.handler(authRequest);
    if (!authResponse.ok) {
      const text = await authResponse.text().catch(() => "");
      if (text.includes("INVALID_TOKEN") || authResponse.status === 400) {
        return redirect(`${resetPath}?error=invalid_token`, 303);
      }
      return redirect(`${resetPath}?token=${encodeURIComponent(token)}&error=reset_failed`, 303);
    }
    return redirect(`${loginPath}?reset=success`, 303);
  } catch (err) {
    console.error("Reset password error:", err);
    return redirect(`${loginPath}?error=reset_failed`, 303);
  }
};
