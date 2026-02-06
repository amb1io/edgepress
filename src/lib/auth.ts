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
  },
  baseURL: env.BETTER_AUTH_URL,
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
