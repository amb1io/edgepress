import { auth } from "../../lib/auth.ts";
import type { APIRoute } from "astro";
import { getString } from "../../lib/utils/form-data.ts";
import { sanitizeCallbackURL } from "../../lib/utils/url-validator.ts";
import {
  badRequestHtmlResponse,
  htmxRedirectResponse,
} from "../../lib/utils/http-responses.ts";

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get("content-type") ?? "";
  let email: string;
  let password: string;
  let callbackURL: string | undefined;

  const isHtmx = request.headers.get("HX-Request") === "true";

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    email = getString(formData, "email");
    password = (formData.get("password") as string) ?? "";
    const callbackURLRaw = getString(formData, "callbackURL");
    callbackURL = callbackURLRaw === "" ? undefined : callbackURLRaw;
  } else {
    if (isHtmx) return badRequestHtmlResponse("Requisição inválida.");
    return redirect(`/login?error=invalid_request`, 303);
  }

  const loginPath = `/login`;

  if (!email || !password) {
    if (isHtmx) return badRequestHtmlResponse("Preencha email e senha.");
    return redirect(`/login?error=missing_fields`, 303);
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
      const errorText = await authResponse.text().catch(() => "Unknown error");
      console.error("Login failed:", {
        email,
        error: errorText,
        url: authRequest.url,
      });
      if (isHtmx)
        return badRequestHtmlResponse(
          "Email ou senha incorretos. Tente novamente.",
        );
      return redirect(`${loginPath}?error=invalid_credentials`, 303);
    }

    const data = (await authResponse.json().catch(() => ({}))) as {
      url?: string;
    };
    const location = data.url ?? safeCallbackURL;

    if (isHtmx) {
      const res = htmxRedirectResponse(location);
      const cookies = authResponse.headers.getSetCookie?.() ?? [];
      if (cookies.length > 0) {
        for (const cookie of cookies) res.headers.append("Set-Cookie", cookie);
      } else {
        const setCookie = authResponse.headers.get("set-cookie");
        if (setCookie) res.headers.append("Set-Cookie", setCookie);
      }
      return res;
    }

    const responseHeaders = new Headers({ Location: location });
    const cookies = authResponse.headers.getSetCookie?.() ?? [];
    if (cookies.length > 0) {
      for (const cookie of cookies)
        responseHeaders.append("Set-Cookie", cookie);
    } else {
      const setCookie = authResponse.headers.get("set-cookie");
      if (setCookie) responseHeaders.append("Set-Cookie", setCookie);
    }
    return new Response(null, { status: 303, headers: responseHeaders });
  } catch (err) {
    console.error("Login error:", err);
    if (request.headers.get("HX-Request") === "true") {
      return badRequestHtmlResponse(
        "Email ou senha incorretos. Tente novamente.",
      );
    }
    return redirect(`/login?error=invalid_credentials`, 303);
  }
};
