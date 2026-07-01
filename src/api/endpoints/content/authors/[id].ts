/**
 * GET /api/content/authors/[id]
 *
 * Retorna dados públicos do autor (name, image, description) por user id.
 * Sem email; read-only para temas e CLI --connect.
 */
import type { APIRoute } from "astro";
import { createEdgepressContent } from "../../../../core/services/edgepress-content.ts";
import {
  jsonResponse,
  notFoundResponse,
} from "../../../../utils/http-responses.ts";

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const id = params?.id?.trim();
  if (!id) {
    return notFoundResponse("Not Found");
  }

  const content = createEdgepressContent(locals);
  const author = await content.getAuthorByUserId(id);
  if (!author) {
    return notFoundResponse("Not Found");
  }

  return jsonResponse(author);
};
