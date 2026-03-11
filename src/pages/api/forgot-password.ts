import { auth } from "../../lib/auth.ts";
import type { APIRoute } from "astro";
import { defaultLocale } from "../../i18n/index.ts";
import { getString } from "../../lib/utils/form-data.ts";

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    return redirect(`/${defaultLocale}/login`, 303);
  }

  const formData = await request.formData();
  const email = getString(formData, "email");
  const forgotPath = `/login/forgot-password`;

  if (!email) {
    return redirect(`${forgotPath}?error=missing_email`, 303);
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const redirectTo = `${origin}/login/reset-password`;
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
    // Sempre redirecionar com sucesso para não revelar se o email existe
    return redirect(`${forgotPath}?sent=1`, 303);
  } catch (err) {
    console.error("Forgot password error:", err);
    return redirect(`${forgotPath}?sent=1`, 303);
  }
};
