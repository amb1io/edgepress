import { auth } from "../../lib/auth.ts";
import type { APIRoute } from "astro";
import { getString } from "../../lib/utils/form-data.ts";

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    return redirect(`/login`, 303);
  }

  const formData = await request.formData();
  const token = getString(formData, "token");
  const newPassword = getString(formData, "newPassword");
  const confirmPassword = getString(formData, "confirmPassword");

  const resetPath = `/login/reset-password`;

  if (!token) {
    return redirect(`/login/reset-password?error=invalid_token`, 303);
  }
  if (!newPassword || newPassword.length < 8) {
    return redirect(
      `/login/reset-password?token=${encodeURIComponent(token)}&error=password_too_short`,
      303,
    );
  }
  if (newPassword !== confirmPassword) {
    return redirect(
      `/login/reset-password?token=${encodeURIComponent(token)}&error=password_mismatch`,
      303,
    );
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
        return redirect(`/login/reset-password?error=invalid_token`, 303);
      }
      return redirect(
        `/login/reset-password?token=${encodeURIComponent(token)}&error=reset_failed`,
        303,
      );
    }
    return redirect(`/login?reset=success`, 303);
  } catch (err) {
    console.error("Reset password error:", err);
    return redirect(`/login?error=reset_failed`, 303);
  }
};
