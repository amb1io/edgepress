import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import {
  user,
  session,
  account,
  verification,
  userRelations,
  sessionRelations,
  accountRelations,
} from "../db/schema/auth.ts";
import { hashPassword as lightHash, verifyPassword as lightVerify } from "./auth-password.ts";
import { sendPasswordResetEmail } from "./resend.ts";

const authSchema = {
  user,
  session,
  account,
  verification,
  userRelations,
  sessionRelations,
  accountRelations,
};

const authDb = drizzle(env.DB, { schema: authSchema });

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    password: {
      hash: lightHash,
      verify: lightVerify,
    },
    sendResetPassword: async ({ user, url }) => {
      // In local development, variables come from .dev.vars (wrangler). Fallback to process.env if available.
      const envAny = env as { RESEND_API_KEY?: string; RESEND_FROM?: string };
      const resendApiKey = envAny.RESEND_API_KEY ?? (typeof process !== "undefined" ? process.env?.RESEND_API_KEY : undefined);
      const resendFrom = envAny.RESEND_FROM ?? (typeof process !== "undefined" ? process.env?.RESEND_FROM : undefined);

      if (resendApiKey?.trim() && resendFrom?.trim()) {
        if (typeof console !== "undefined" && console.info) {
          console.info("[Password reset] Enviando email via Resend para", user.email);
        }
        await sendPasswordResetEmail({
          apiKey: resendApiKey.trim(),
          from: resendFrom.trim(),
          to: user.email,
          url,
        });
      } else {
        if (typeof console !== "undefined" && console.info) {
          console.info(
            "[Password reset] (local) RESEND_API_KEY ou RESEND_FROM ausente. Link para",
            user.email,
            ":",
            url
          );
        }
      }
    },
  },
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: (() => {
    const trusted = (env as { BETTER_AUTH_TRUSTED_ORIGINS?: string }).BETTER_AUTH_TRUSTED_ORIGINS;
    return trusted ? trusted.split(",").map((o: string) => o.trim()) : [env.BETTER_AUTH_URL, "http://localhost:8788"];
  })(),
  user: {
    additionalFields: {
      role: {
        type: "number",
        required: false,
        defaultValue: 3, // 3 = leitor
        input: true, // Permitir input durante signup
      },
    },
  },
  database: drizzleAdapter(authDb, {
    provider: "sqlite",
    schema: authSchema,
  }),
});
