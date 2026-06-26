import type { APIRoute } from "astro";
import { handlePublicThemeRequest } from "../core/theme/public-handler.ts";

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  return handlePublicThemeRequest(request, locals);
};
