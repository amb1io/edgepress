import type { APIRoute } from "astro";
import { badRequestResponse, jsonResponse, notFoundResponse } from "../../../lib/utils/http-responses.ts";
import { themeContentGateway } from "../../../lib/services/theme-content-gateway.ts";

export const prerender = false;

function queryObject(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) out[key] = value;
  return out;
}

export const GET: APIRoute = async ({ params, url }) => {
  const resource = params["resource"];
  if (!resource) return badRequestResponse("resource is required");

  const query = queryObject(url);
  if (resource === "posts") {
    const data = await themeContentGateway.getPosts(query);
    return jsonResponse({ data });
  }

  if (resource === "posttype") {
    const slug = (url.searchParams.get("slug") ?? "").trim();
    if (!slug) return badRequestResponse("slug is required for posttype");
    const data = await themeContentGateway.getPostsByType(slug, query);
    return jsonResponse({ data });
  }

  if (resource === "job") {
    const slug = (url.searchParams.get("slug") ?? "").trim();
    if (!slug) return badRequestResponse("slug is required for job");
    const data = await themeContentGateway.getJobBySlug(slug);
    return jsonResponse({ data });
  }

  if (resource === "categories-to-posts") {
    const data = await themeContentGateway.getCategoriesToPosts(query);
    return jsonResponse({ data });
  }

  if (resource === "categories") {
    const id = url.searchParams.get("id");
    const numericId = id && /^\d+$/.test(id) ? parseInt(id, 10) : undefined;
    const data = await themeContentGateway.getCategories(numericId);
    return jsonResponse({ data });
  }

  return notFoundResponse("resource not found");
};
