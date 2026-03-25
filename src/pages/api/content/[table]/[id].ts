/**
 * GET /api/content/[table]/[id_or_slug]
 *
 * Retorna um único registro por ID ou slug.
 * - Se table = "posts": aceita id (numérico) ou slug no segundo segmento. Query ?status= opcional (padrão published).
 * - Para outras tabelas: apenas id numérico (SELECT * FROM table WHERE id = ?).
 * Cache: não autenticado usa KV primeiro (só para posts); autenticado bypass KV.
 */
import type { APIRoute } from "astro";
import { db } from "../../../../db/index.ts";
import {
  ContentBadRequestError,
  ContentNotFoundError,
  getPostOrRowFromUrl,
} from "../../../../lib/services/edgepress-content.ts";
import { getTableNames, getSafeTableName } from "../../../../lib/db-utils.ts";
import {
  badRequestResponse,
  errorResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
} from "../../../../lib/utils/http-responses.ts";
import { HTTP_STATUS_CODES } from "../../../../lib/constants/index.ts";

export const prerender = false;

export const GET: APIRoute = async ({ params, url, locals }) => {
  const tableParam = params["table"];
  const idOrSlug = params["id"];

  if (!tableParam || idOrSlug === undefined || idOrSlug === "") {
    return badRequestResponse("Table and id or slug are required");
  }

  const allowedTables = await getTableNames(db);
  const safeTable = getSafeTableName(tableParam, allowedTables);
  if (!safeTable) {
    return notFoundResponse("Table not found or not allowed");
  }

  try {
    const data = await getPostOrRowFromUrl(locals, safeTable, idOrSlug, url);
    return jsonResponse(data);
  } catch (err) {
    if (err instanceof ContentNotFoundError) {
      return errorResponse(err.message, HTTP_STATUS_CODES.NOT_FOUND, err.detail);
    }
    if (err instanceof ContentBadRequestError) {
      return badRequestResponse(err.message);
    }
    const message = err instanceof Error ? err.message : "Internal server error";
    return internalServerErrorResponse(message);
  }
};
