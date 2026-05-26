import type { APIRoute } from "astro";
import { db } from "../db/index.ts";
import {
  buildSitemapXml,
  getSitemapEntries,
} from "../core/services/sitemap-service.ts";

export const prerender = false;

export const GET: APIRoute = async () => {
  const entries = await getSitemapEntries(db);
  const xml = buildSitemapXml(entries);

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
