import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import robotsTxt from "astro-robots-txt";
import cloudflare from "@astrojs/cloudflare";

const isDev = process.env.NODE_ENV === "development";

// https://astro.build/config
export default defineConfig({
  image: {
    domains: [
      "59395621.sonicjs-309.pages.dev",
      "sonicjs-media.amb1.io",
      "20442fb0.sonicjs-309.pages.dev",
      "fb4ec995.sonicjs-309.pages.dev",
      "bucket-hml.farra.media",
      "bucket.farra.media",
      "cms.farra.media",
    ],
  },
  output: "server",
  adapter: isDev ? undefined : cloudflare(),
  integrations: [sitemap(), robotsTxt()],
});
