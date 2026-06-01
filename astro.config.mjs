// blind update
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { existsSync, readFileSync } from "node:fs";
import { defineConfig, sessionDrivers } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

import alpinejs from "@astrojs/alpinejs";
import sitemap from "@astrojs/sitemap";

import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import icon from "astro-icon";

const root = path.dirname(fileURLToPath(import.meta.url));
const patchPagesWrangler = path.join(root, "scripts/patch-pages-wrangler.mjs");
const shimDebug = path.resolve(root, "src/utils/shim-debug.ts");
const shimAsyncHooks = path.resolve(root, "src/utils/shim-node-async-hooks.ts");
const reactRoot = path.resolve(root, "node_modules/react");
const reactDomRoot = path.resolve(root, "node_modules/react-dom");

const siteOrigin =
  process.env.SITE_URL?.trim() ||
  process.env.BETTER_AUTH_URL?.trim() ||
  "http://localhost:4321";

function loadSitemapCustomPages() {
  const jsonPath = path.join(root, "src/generated/sitemap-urls.json");
  if (!existsSync(jsonPath)) return [];
  try {
    const data = JSON.parse(readFileSync(jsonPath, "utf8"));
    return Array.isArray(data) ? data.filter((u) => typeof u === "string") : [];
  } catch {
    return [];
  }
}

const sitemapCustomPages = loadSitemapCustomPages();

const SITEMAP_EXCLUDED_PREFIXES = ["/admin", "/api", "/login", "/setup", "/themes"];

function shouldIncludeInSitemap(page) {
  try {
    const pathname = new URL(page, "https://placeholder.local").pathname;
    return !SITEMAP_EXCLUDED_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
  } catch {
    return false;
  }
}

export default defineConfig({
  site: siteOrigin,
  adapter: cloudflare({
    sessionKVBindingName: "edgepress_cache",
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
    routing: "manual",
  },

  vite: {
    plugins: [
      tailwindcss(),
      /**
       * O adapter Cloudflare escreve `assets.binding: ASSETS` em dist/server/wrangler.json;
       * o Pages rejeita esse binding. O npm `postbuild` não corre com `npx astro build` só.
       * Repetimos o patch aqui no fim do bundle do servidor para `wrangler deploy` estar sempre seguro.
       */
      {
        name: "edgepress-patch-pages-wrangler",
        apply: "build",
        enforce: "post",
        /** Uma vez por invocação `vite build` (cliente + servidor = pode correr 2x; o script é idempotente). */
        buildEnd() {
          try {
            execFileSync(process.execPath, [patchPagesWrangler], {
              cwd: root,
              stdio: "inherit",
            });
          } catch {
            /* dist/server/wrangler.json ainda não existe nesta fase */
          }
        },
      },
    ],
    // Astro 6 + @cloudflare/vite-plugin: otimização incremental de deps no workerd pode
    // invalidar chunks em node_modules/.vite/deps_ssr durante reload ("file does not exist"
    // / "Module is undefined"). Mantém drizzle/auth/libsql fora do dep optimizer.
    optimizeDeps: {
      entries: ["src/components/admin/BlockNoteEditor.tsx"],
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@blocknote/core",
        "@blocknote/react",
        "@blocknote/mantine",
        "@blocknote/xl-multi-column",
        "@mantine/core",
        "@mantine/hooks",
      ],
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
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
      alias: [
        // Uma única instância de React no client (BlockNote + ilha Astro).
        { find: "react-dom/client", replacement: path.join(reactDomRoot, "client.js") },
        { find: "react/jsx-dev-runtime", replacement: path.join(reactRoot, "jsx-dev-runtime.js") },
        { find: "react/jsx-runtime", replacement: path.join(reactRoot, "jsx-runtime.js") },
        { find: "react", replacement: path.join(reactRoot, "index.js") },
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
    ssr: {
      optimizeDeps: {
        include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
        // Mesmo exclude do optimizeDeps raiz: evita deps_ssr corrompidos com drizzle no workerd.
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
    },
  },

  integrations: [
    alpinejs(),
    react({
      experimentalDisableStreaming: true,
    }),
    icon(),
    sitemap({
      customPages: sitemapCustomPages,
      filter: (page) => shouldIncludeInSitemap(page),
    }),
  ],
});
