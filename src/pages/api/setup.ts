/**
 * API de conclusão do setup inicial.
 * POST: aplica migrações se necessário (cria tabelas se não existirem), cria o primeiro usuário (better-auth),
 * executa seed apenas quando não havia tabelas ou setup_done = "N", atualiza site_name, site_description e seta setup_done=Y.
 * A função de seed não é exposta como API; só é chamada neste fluxo.
 */
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { auth } from "../../lib/auth.ts";
import { db } from "../../db/index.ts";
import { settings as settingsTable } from "../../db/schema.ts";
import { eq } from "drizzle-orm";
import { sanitizeCallbackURL } from "../../lib/utils/url-validator.ts";
import { runSeed } from "../../db/seed.ts";
import { runMigrationsIfNeeded } from "../../db/run-migrations-d1.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, redirect }) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    return redirect("/setup?error=invalid_request", 303);
  }

  const formData = await request.formData();
  const name = (formData.get("name") as string)?.trim() ?? "";
  const email = (formData.get("email") as string)?.trim() ?? "";
  const password = (formData.get("password") as string) ?? "";
  const siteName = (formData.get("site_name") as string)?.trim() ?? "";
  const siteDescription =
    (formData.get("site_description") as string)?.trim() ?? "";

  if (!name || !email || !password) {
    return redirect("/setup?error=missing_fields", 303);
  }
  if (password.length < 8) {
    return redirect("/setup?error=password_too_short", 303);
  }

  const url = new URL(request.url);
  const origin = url.origin;
  const locale = "pt-br";
  const defaultCallback = `/${locale}/admin`;
  const safeCallbackURL = sanitizeCallbackURL(
    defaultCallback,
    origin,
    defaultCallback,
  );

  await runMigrationsIfNeeded(env.DB);

  let needSeed = true;
  try {
    const [row] = await db
      .select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.name, "setup_done"))
      .limit(1);
    if (row?.value === "Y") needSeed = false;
  } catch {
    needSeed = true;
  }
  if (needSeed) {
    await runSeed(db);
  }

  const authRequest = new Request(`${origin}/api/auth/sign-up/email`, {
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
      role: 0,
      callbackURL: safeCallbackURL,
    }),
  });

  const authResponse = await auth.handler(authRequest);
  if (!authResponse.ok) {
    const errData = (await authResponse.json().catch(() => ({}))) as {
      code?: string;
    };
    const code = errData?.code ?? "signup_failed";
    return redirect(`/setup?error=${encodeURIComponent(code)}`, 303);
  }

  await db
    .update(settingsTable)
    .set({ value: siteName || "demo site" })
    .where(eq(settingsTable.name, "site_name"));
  await db
    .update(settingsTable)
    .set({ value: siteDescription || "demo_description" })
    .where(eq(settingsTable.name, "site_description"));
  await db
    .update(settingsTable)
    .set({ value: "Y" })
    .where(eq(settingsTable.name, "setup_done"));

  // Criar resposta de redirect com cookie para session storage server-side
  const response = redirect(`/${locale}/login?setup=success`, 303);
  // Definir cookie que pode ser lido pelo middleware (equivalente ao session storage)
  response.headers.set(
    "Set-Cookie",
    "setup_done=Y; Path=/; HttpOnly; SameSite=Lax",
  );
  return response;
};
