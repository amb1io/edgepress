/**
 * GET /api/content/[tableOrSlug]
 *
 * Comportamento:
 * - Se o segmento da rota corresponder ao nome de uma tabela conhecida (ex: /settings, /posts),
 *   retorna a listagem dinâmica dessa tabela com cache em KV.
 * - Caso contrário, trata o segmento como slug de post (ex: /titulo-do-post) e:
 *   - Busca o post pelo slug;
 *   - Busca as mídias relacionadas (attachments) e devolve em uma chave `media`;
 *   - Usa KV como cache da resposta completa do post.
 *
 * Query params da listagem de tabela: page, limit, order, orderDir, filter_<col>=value
 */
import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import {
  ContentBadRequestError,
  ContentNotFoundError,
  getPostBySlugFromUrl,
  getTableContentListFromUrl,
} from "../../../lib/services/edgepress-content.ts";
import { getTableNames, getSafeTableName, VALID_TABLE_IDENTIFIER } from "../../../lib/db-utils.ts";
import { isValidSlug } from "../../../lib/utils/validation.ts";
import {
  badRequestResponse,
  errorResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
} from "../../../lib/utils/http-responses.ts";
import { HTTP_STATUS_CODES } from "../../../lib/constants/index.ts";

export const prerender = false;

export const GET: APIRoute = async ({ params, url, locals }) => {
  const segment = params["table"];
  if (!segment) {
    return badRequestResponse("Path segment is required");
  }

  const allowedTables = await getTableNames(db);
  const safeTable = getSafeTableName(segment, allowedTables);

  if (safeTable === null && VALID_TABLE_IDENTIFIER.test(segment)) {
    return notFoundResponse("Table not found or not allowed");
  }

  if (safeTable !== null) {
    try {
      const result = await getTableContentListFromUrl(locals, safeTable, url);
      return jsonResponse(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal server error";
      return internalServerErrorResponse(message);
    }
  }

  const slug = segment;
  if (!isValidSlug(slug)) {
    return badRequestResponse("Slug inválido");
  }

  try {
    const payload = await getPostBySlugFromUrl(locals, slug, url);
    return jsonResponse(payload);
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
