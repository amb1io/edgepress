import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, sessionDrivers } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

import alpinejs from "@astrojs/alpinejs";

import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import icon from "astro-icon";

const root = path.dirname(fileURLToPath(import.meta.url));
const shimDebug = path.resolve(root, "src/lib/shim-debug.ts");
const shimAsyncHooks = path.resolve(root, "src/lib/shim-node-async-hooks.ts");

export default defineConfig({
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
      configPath: "wrangler.toml",
    },
  }),
  /**
   * Autenticação usa better-auth; não usamos a API de sessão do Astro.
   * Sem driver explícito, o adapter Cloudflare injeta KV SESSION sem id (quebra o deploy no Pages).
   */
  session: {
    driver: sessionDrivers.memory(),
  },
  srcDir: "./src",
  output: "server",

  i18n: {
    locales: ["en", "es", "pt-br"],
    defaultLocale: "pt-br",
    routing: {
      prefixDefaultLocale: false,
    },
  },

  vite: {
    plugins: [tailwindcss()],
    // Astro 6 + @cloudflare/vite-plugin: otimização incremental de deps no workerd pode
    // invalidar chunks em node_modules/.vite/deps_ssr durante reload ("file does not exist"
    // / "Module is undefined"). Mantém drizzle/auth/libsql fora do dep optimizer.
    optimizeDeps: {
      exclude: [
        "drizzle-orm",
        "drizzle-orm/d1",
        "drizzle-orm/sqlite-core",
        "drizzle-orm/libsql",
        "better-auth",
        "better-auth/adapters/drizzle",
        "@libsql/client",
        "@noble/hashes",
      ],
    },
    resolve: {
      alias: [
        // Cloudflare Workers não expõe node:async_hooks; better-auth (e deps) usam e quebram em runtime.
        { find: "node:async_hooks", replacement: shimAsyncHooks },
        { find: "async_hooks", replacement: shimAsyncHooks },
        // Runner resolve debug como file:///.../node_modules/debug/src/index.js — alias bare não pega.
        {
          find: /[\\/]node_modules[\\/]debug(?:[\\/].*)?$/,
          replacement: shimDebug,
        },
        { find: "debug", replacement: shimDebug },
        ...(import.meta.env.PROD
          ? [{ find: "react-dom/server", replacement: "react-dom/server.edge" }]
          : []),
      ],
    },
  },

  integrations: [alpinejs(), react(), icon()],
});
