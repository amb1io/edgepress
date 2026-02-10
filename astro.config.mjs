import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

import alpinejs from "@astrojs/alpinejs";

import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import icon from "astro-icon";

export default defineConfig({
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
      configPath: "wrangler.jsonc",
    },
  }),
  srcDir: "./src",
  output: "server",

  i18n: {
    locales: ["en", "es", "pt-br"],
    defaultLocale: "pt-br",
    routing: {
      prefixDefaultLocale: true,
    },
  },

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        // Cloudflare Workers não expõe node:async_hooks; better-auth (e deps) usam e quebram em runtime.
        // Resolver para shim que é bundled e funciona em Workers.
        "node:async_hooks": "./src/lib/shim-node-async-hooks.ts",
        async_hooks: "./src/lib/shim-node-async-hooks.ts",
        ...(import.meta.env.PROD
          ? {
              "react-dom/server": "react-dom/server.edge",
            }
          : {}),
      },
    },
  },

  integrations: [alpinejs(), react(), icon()],
});