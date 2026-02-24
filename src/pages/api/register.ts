/**
 * User registration API via better-auth (email + password).
 * @see https://www.better-auth.com/docs/authentication/email-password
 * Prevents privilege escalation: only authenticated admin can set role other than reader (3).
 */
import { auth } from "../../lib/auth.ts";
import { USER_ROLE_IDS } from "../../db/schema.ts";
import type { APIRoute } from "astro";
import { getString } from "../../lib/utils/form-data.ts";
import { applyRateLimit, getRateLimits } from "../../lib/utils/rate-limiter.ts";
import { sanitizeCallbackURL } from "../../lib/utils/url-validator.ts";
import { getSession } from "../../lib/api-auth.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  // Get rate limits from the environment (locals may be undefined in tests or SSR)
  const env = (
    locals as { runtime?: { env?: Record<string, string> } } | undefined
  )?.runtime?.env;
  const rateLimits = getRateLimits(env);

  // Apply rate limiting: configurable via env (default: 3 registrations / hour)
  const rateLimitResponse = applyRateLimit(request, rateLimits.REGISTER);
  if (rateLimitResponse) {
    return redirect("/?error=rate_limit_exceeded", 303);
  }
  const contentType = request.headers.get("content-type") ?? "";
  let name: string;
  let email: string;
  let password: string;
  let image: string | undefined;
  let role: string | undefined; // form sends string "0".."3"
  let callbackURL: string | undefined;
  let locale: string | undefined;

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    name = getString(formData, "name");
    email = getString(formData, "email");
    password = (formData.get("password") as string) ?? "";
    const imageRaw = getString(formData, "image");
    image = imageRaw === "" ? undefined : imageRaw;
    const roleRaw = getString(formData, "role");
    role = roleRaw === "" ? undefined : roleRaw;
    const callbackURLRaw = getString(formData, "callbackURL");
    callbackURL = callbackURLRaw === "" ? undefined : callbackURLRaw;
    const localeRaw = getString(formData, "locale");
    locale = localeRaw === "" ? undefined : localeRaw;
  } else {
    return redirect(
      `/${locale || "pt-br"}/admin/content?post_type=user&action=new&error=invalid_request`,
      303,
    );
  }

  if (!name || !email || !password) {
    return redirect(
      `/${locale || "pt-br"}/admin/content?post_type=user&action=new&error=missing_fields`,
      303,
    );
  }

  if (password.length < 8) {
    return redirect(
      `/${locale || "pt-br"}/admin/content?post_type=user&action=new&error=password_too_short`,
      303,
    );
  }

  let roleValue: number;
  const session = await getSession(request);
  const isAdmin = session?.user?.role === 0;
  if (isAdmin) {
    const roleNum =
      role !== undefined && role !== "" ? parseInt(role, 10) : NaN;
    roleValue =
      Number.isNaN(roleNum) ||
      !USER_ROLE_IDS.includes(roleNum as (typeof USER_ROLE_IDS)[number])
        ? 3
        : roleNum;
  } else {
    // Prevent privilege escalation: only admin can set a role different from reader
    roleValue = 3; // reader
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const authPath = "/api/auth/sign-up/email";

  // Sanitize and validate callbackURL to prevent Open Redirect
  const defaultCallback = `/${locale || "pt-br"}/admin/list?type=user&limit=10&page=1`;
  const safeCallbackURL = sanitizeCallbackURL(
    callbackURL,
    origin,
    defaultCallback,
  );

  const authRequest = new Request(`${origin}${authPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Origin: origin,
      cookie: request.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({
      name,
      email,
      password,
      ...(image && { image }),
      role: roleValue, // Always send role, even when it is the default
      callbackURL: safeCallbackURL,
    }),
  });

  const authResponse = await auth.handler(authRequest);

  if (!authResponse.ok) {
    const errData = await authResponse.json().catch(() => ({}));
    const errorText = await authResponse.text().catch(() => "Unknown error");
    const code = errData?.code ?? "signup_failed";
    console.error("Registration failed:", {
      email,
      name,
      role: roleValue,
      status: authResponse.status,
      error: errorText,
      errData,
    });
    return redirect(
      `/${locale || "pt-br"}/admin/content?post_type=user&action=new&error=${encodeURIComponent(code)}`,
      303,
    );
  }

  const data = await authResponse.json().catch(() => ({}));
  const location =
    data?.url ?? `/${locale || "pt-br"}/admin/list?type=user&limit=10&page=1`;

  const responseHeaders = new Headers({ Location: location });
  // Only forward Set-Cookie when it is NOT an admin creating a user: this preserves the
  // current session (admin) and the new user is just registered without logging in.
  if (!isAdmin) {
    const cookies = authResponse.headers.getSetCookie?.() ?? [];
    if (cookies.length > 0) {
      for (const cookie of cookies) {
        responseHeaders.append("Set-Cookie", cookie);
      }
    } else {
      const setCookie = authResponse.headers.get("set-cookie");
      if (setCookie) responseHeaders.append("Set-Cookie", setCookie);
    }
  }

  return new Response(null, {
    status: 303,
    headers: responseHeaders,
  });
};
