import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { getSiteOrigin } from "../../../core/services/sitemap-service.ts";
import { buildWebSiteJsonLd } from "../../../core/services/json-ld-service.ts";
import { getSettingsWithCache } from "../../../core/services/settings-service.ts";
import { jsonResponse } from "../../../utils/http-responses.ts";
import {
  getCacheKvFromLocals,
  isAuthenticatedFromLocals,
} from "../../../utils/runtime-locals.ts";

export const prerender = false;

/**
 * GET /api/content/site
 * Metadados do site + JSON-LD WebSite para a home.
 */
export const GET: APIRoute = async ({ url, locals }) => {
  const cacheOpts = {
    kv: getCacheKvFromLocals(locals),
    isAuthenticated: isAuthenticatedFromLocals(locals),
  };
  const settings = await getSettingsWithCache(db, {
    namesParam: "site_name,site_description,site_url",
    ...cacheOpts,
  });

  const site_url = await getSiteOrigin(db, {}, cacheOpts);
  const json_ld = await buildWebSiteJsonLd(db, url.origin || site_url, cacheOpts);

  return jsonResponse({
    site_name: settings.site_name ?? "",
    site_description: settings.site_description ?? "",
    site_url,
    json_ld,
  });
};
