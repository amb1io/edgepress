import type { APIRoute } from "astro";
import { db } from "../../db/index.ts";
import { requireMinRole } from "../../utils/api-auth.ts";
import { getString, getBoolean, getNumber } from "../../utils/form-data.ts";
import {
  badRequestResponse,
  errorResponse,
  htmxRefreshResponse,
  internalServerErrorResponse,
} from "../../utils/http-responses.ts";
import { HTTP_STATUS_CODES } from "../../shared/constants/index.ts";
import { emailExists, createUser } from "../../core/services/user-service.ts";
import { invalidateContentListByTable } from "../../utils/kv-cache-sync.ts";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  try {
    const formData = await request.formData();
    const name = getString(formData, "name");
    const email = getString(formData, "email");
    const imageRaw = getString(formData, "image");
    const image = imageRaw === "" ? null : imageRaw;
    const emailVerified = getBoolean(formData, "emailVerified", false);
    const roleNum = getNumber(formData, "role", null);

    if (!name || !email) {
      return badRequestResponse("Bad Request");
    }

    if (await emailExists(db, email)) {
      return errorResponse("Conflict: email already exists", HTTP_STATUS_CODES.CONFLICT);
    }

    await createUser(db, {
      name,
      email,
      image,
      emailVerified,
      role: roleNum ?? undefined,
    });

    await invalidateContentListByTable(locals, "user");
    return htmxRefreshResponse();
  } catch (err) {
    console.error("POST /api/users", err);
    return internalServerErrorResponse();
  }
};
