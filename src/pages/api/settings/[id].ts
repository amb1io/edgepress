import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { requireMinRole } from "../../../lib/api-auth.ts";
import { getString, getBoolean } from "../../../lib/utils/form-data.ts";
import {
  badRequestResponse,
  htmxRefreshResponse,
  internalServerErrorResponse,
  jsonResponse,
  notFoundResponse,
} from "../../../lib/utils/http-responses.ts";
import {
  getSettingById,
  updateSettingById,
  deleteSettingById,
  settingExists,
} from "../../../lib/services/settings-service.ts";

export const prerender = false;

function parseId(idRaw: string | undefined): number | null {
  if (!idRaw) return null;
  const id = parseInt(idRaw, 10);
  return Number.isNaN(id) ? null : id;
}

export const GET: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 1, locals);
  if (authResult instanceof Response) return authResult;

  const id = parseId(params?.id);
  if (id === null) {
    return badRequestResponse("Bad Request");
  }

  const row = await getSettingById(db, id);
  if (!row) {
    return notFoundResponse("Not Found");
  }

  return jsonResponse({
    id: row.id,
    name: row.name,
    value: row.value,
    autoload: row.autoload,
  });
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const id = parseId(params?.id);
  if (id === null) {
    return badRequestResponse("Bad Request");
  }

  const exists = await settingExists(db, id);
  if (!exists) {
    return notFoundResponse("Not Found");
  }

  await deleteSettingById(db, id);
  return htmxRefreshResponse();
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const id = parseId(params?.id);
  if (id === null) {
    return badRequestResponse("Bad Request");
  }

  const exists = await settingExists(db, id);
  if (!exists) {
    return notFoundResponse("Not Found");
  }

  try {
    const contentType = request.headers.get("Content-Type") ?? "";
    let name: string;
    let value: string;
    let autoload: boolean;

    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      name = String(body?.name ?? "").trim();
      value = String(body?.value ?? "").trim();
      autoload = body?.autoload === true || body?.autoload === "1";
    } else {
      const formData = await request.formData();
      name = getString(formData, "name");
      value = getString(formData, "value");
      autoload = getBoolean(formData, "autoload", true);
    }

    if (!name) {
      return badRequestResponse("Name is required");
    }

    await updateSettingById(db, id, { name, value, autoload });
    return htmxRefreshResponse();
  } catch (err) {
    console.error("PUT /api/settings/[id]", err);
    return internalServerErrorResponse();
  }
};
