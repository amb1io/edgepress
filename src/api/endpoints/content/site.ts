import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { getSiteOrigin } from "../../../core/services/sitemap-service.ts";
import { buildWebSiteJsonLd } from "../../../core/services/json-ld-service.ts";
import { getSettingsFromDb } from "../../../core/services/settings-service.ts";
import { jsonResponse } from "../../../utils/http-responses.ts";

export const prerender = false;

/**
 * GET /api/content/site
 * Metadados do site + JSON-LD WebSite para a home.
 */
export const GET: APIRoute = async ({ url }) => {
  const settings = await getSettingsFromDb(db, {
    names: ["site_name", "site_description", "site_url"],
  });

  const site_url = await getSiteOrigin(db);
  const json_ld = await buildWebSiteJsonLd(db, url.origin || site_url);

  return jsonResponse({
    site_name: settings.site_name ?? "",
    site_description: settings.site_description ?? "",
    site_url,
    json_ld,
  });
};
