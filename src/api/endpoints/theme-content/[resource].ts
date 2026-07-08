import type { APIRoute } from "astro";
import { badRequestResponse, jsonResponse, notFoundResponse } from "../../../utils/http-responses.ts";
import { themeContentGateway } from "../../../core/services/theme-content-gateway.ts";
import { getCacheKvFromLocals } from "../../../utils/runtime-locals.ts";
import {
  buildThemeContentCacheKey,
  getThemeContentFromCache,
  putThemeContentCache,
} from "../../../utils/theme-content-cache.ts";

export const prerender = false;

function queryObject(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) out[key] = value;
  return out;
}

async function withThemeContentCache<T>(
  locals: App.Locals,
  resource: string,
  params: Record<string, string>,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const kv = getCacheKvFromLocals(locals);
  const key = buildThemeContentCacheKey(resource, params);
  const cached = await getThemeContentFromCache(kv, key);
  if (cached != null) return cached as T;
  const data = await fetchFn();
  if (data != null && !(Array.isArray(data) && data.length === 0)) {
    await putThemeContentCache(kv, key, data);
  }
  return data;
}

export const GET: APIRoute = async ({ params, url, locals }) => {
  const resource = params["resource"];
  if (!resource) return badRequestResponse("resource is required");

  const query = queryObject(url);
  if (resource === "posts") {
    const data = await withThemeContentCache(locals, "posts", query, () =>
      themeContentGateway.getPosts(query),
    );
    return jsonResponse({ data });
  }

  if (resource === "posttype") {
    const slug = (url.searchParams.get("slug") ?? "").trim();
    if (!slug) return badRequestResponse("slug is required for posttype");
    const data = await withThemeContentCache(locals, "posttype", { ...query, slug }, () =>
      themeContentGateway.getPostsByType(slug, query),
    );
    return jsonResponse({ data });
  }

  if (resource === "page") {
    const slug = (url.searchParams.get("slug") ?? "").trim();
    if (!slug) return badRequestResponse("slug is required for page");
    const data = await withThemeContentCache(locals, "page", { ...query, slug }, () =>
      themeContentGateway.getPageBySlug(slug, query),
    );
    return jsonResponse({ data });
  }

  if (resource === "job") {
    const slug = (url.searchParams.get("slug") ?? "").trim();
    if (!slug) return badRequestResponse("slug is required for job");
    const data = await withThemeContentCache(locals, "job", { slug }, () =>
      themeContentGateway.getJobBySlug(slug),
    );
    return jsonResponse({ data });
  }

  if (resource === "categories-to-posts") {
    const data = await withThemeContentCache(locals, "categories-to-posts", query, () =>
      themeContentGateway.getCategoriesToPosts(query),
    );
    return jsonResponse({ data });
  }

  if (resource === "categories") {
    const id = url.searchParams.get("id");
    const numericId = id && /^\d+$/.test(id) ? parseInt(id, 10) : undefined;
    const data = await withThemeContentCache(
      locals,
      "categories",
      id ? { id } : {},
      () => themeContentGateway.getCategories(numericId),
    );
    return jsonResponse({ data });
  }

  if (resource === "category") {
    const slug = (url.searchParams.get("slug") ?? "").trim();
    if (!slug) return badRequestResponse("slug is required for category");
    const lang = (url.searchParams.get("lang") ?? "").trim() || undefined;
    const metaKey = (url.searchParams.get("metaKey") ?? "").trim();
    const metaValue = (url.searchParams.get("metaValue") ?? "").trim();
    const postType = (url.searchParams.get("postType") ?? "").trim() || undefined;
    const requireBody = url.searchParams.get("requireBody") === "1";
    const data = await withThemeContentCache(locals, "category", query, () =>
      themeContentGateway.getPostsByCategorySlug(slug, lang, {
        postTypeSlug: postType,
        requireBody,
        meta: metaKey && metaValue ? { [metaKey]: metaValue } : undefined,
      }),
    );
    return jsonResponse({ data });
  }

  return notFoundResponse("resource not found");
};
