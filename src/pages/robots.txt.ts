import type { APIRoute } from "astro";
import { db } from "../db/index.ts";
import { getSiteOrigin } from "../core/services/sitemap-service.ts";

export const prerender = false;

const getRobotsTxt = (sitemapURL: string) => `User-agent: *
Allow: /

Sitemap: ${sitemapURL}
`;

export const GET: APIRoute = async () => {
  const origin = await getSiteOrigin(db);
  const base = origin || "http://localhost:4321";
  const sitemapURL = `${base.replace(/\/+$/, "")}/sitemap-index.xml`;

  return new Response(getRobotsTxt(sitemapURL), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
