/**
 * POST /api/admin/list — Página da listagem admin (posts ou tabela dinâmica).
 */
import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { getAdminListPage } from "../../../core/services/admin-list-page.ts";
import { parseDataListOrderParams } from "../../../admin/components/data-list-order.ts";
import { normalizeDataListPageLength } from "../../../admin/components/data-list-page-length.ts";
import {
  getRoleFromUser,
  canAccessRoute,
  isAuthorRole,
} from "../../../utils/permissions.ts";
import {
  jsonResponse,
  unauthorizedResponse,
  badRequestResponse,
  errorResponse,
} from "../../../utils/http-responses.ts";
import { HTTP_STATUS_CODES } from "../../../shared/constants/index.ts";
import type { PaginatedResponse } from "../../../shared/types/api-responses.ts";

export const prerender = false;

type ListRequestBody = {
  type?: string;
  locale?: string;
  page?: number;
  limit?: number;
  status?: string;
  order?: string;
  orderDir?: string;
  orders?: { column: string; dir: "asc" | "desc" }[];
  filter?: Record<string, string>;
  search?: string;
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return unauthorizedResponse();
  }

  const roleId = getRoleFromUser(user);
  const allowed = await canAccessRoute(db, roleId, "/admin/list");
  if (!allowed) {
    return errorResponse("Forbidden", HTTP_STATUS_CODES.FORBIDDEN);
  }

  let body: ListRequestBody;
  try {
    body = (await request.json()) as ListRequestBody;
  } catch {
    return badRequestResponse("JSON inválido");
  }

  const type = typeof body.type === "string" ? body.type.trim() : "";
  if (!type) {
    return badRequestResponse("type é obrigatório");
  }

  const locale =
    typeof body.locale === "string" && body.locale.trim()
      ? body.locale.trim()
      : "pt-br";

  const page = Math.max(1, Number(body.page) || 1);
  const limit = normalizeDataListPageLength(Number(body.limit) || 10);

  const orders =
    body.orders && body.orders.length > 0
      ? body.orders
      : parseDataListOrderParams(body.order, body.orderDir);

  const authorId =
    isAuthorRole(roleId) && (user as { id?: string }).id
      ? (user as { id: string }).id
      : undefined;

  try {
    const result = await getAdminListPage(
      db,
      {
        type,
        page,
        limit,
        ...(body.status ? { status: body.status } : {}),
        orders,
        ...(body.filter ? { filter: body.filter } : {}),
        ...(body.search ? { search: body.search } : {}),
        ...(authorId ? { authorId } : {}),
      },
      locale,
    );

    const response: PaginatedResponse<Record<string, unknown>> = {
      success: true,
      data: result.items,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };

    return jsonResponse(response, HTTP_STATUS_CODES.OK);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao carregar lista";
    return badRequestResponse(message);
  }
};
