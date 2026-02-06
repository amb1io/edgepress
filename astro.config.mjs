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
      // Cloudflare Workers não expõe MessageChannel no contexto em que react-dom/server roda.
      // Usar o build "edge" do React evita a dependência (ver react-dom/server.edge).
      alias:
        import.meta.env.PROD
          ? { "react-dom/server": "react-dom/server.edge" }
          : undefined,
    },
  },

  integrations: [alpinejs(), react(), icon()],
});