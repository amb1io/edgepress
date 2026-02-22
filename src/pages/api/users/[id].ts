import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { requireMinRole, assertCanSetUserRole } from "../../../lib/api-auth.ts";
import { getString, getBoolean, getNumber } from "../../../lib/utils/form-data.ts";
import {
  badRequestResponse,
  errorResponse,
  htmxRefreshResponse,
  internalServerErrorResponse,
  notFoundResponse,
} from "../../../lib/utils/http-responses.ts";
import { HTTP_STATUS_CODES } from "../../../lib/constants/index.ts";
import {
  emailExists,
  updateUser,
  deleteUser,
  userExists,
} from "../../../lib/services/user-service.ts";
import { invalidateContentListByTable } from "../../../lib/kv-cache-sync.ts";

export const prerender = false;

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;

  const id = params?.id?.trim();
  if (!id) {
    return badRequestResponse("Bad Request");
  }

  try {
    if (!(await userExists(db, id))) {
      return notFoundResponse("Not Found");
    }

    await deleteUser(db, id);
    await invalidateContentListByTable(locals, "user");
    return htmxRefreshResponse();
  } catch (err) {
    console.error("DELETE /api/users/[id]", err);
    return internalServerErrorResponse();
  }
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 0, locals);
  if (authResult instanceof Response) return authResult;
  const { user: currentUser } = authResult;

  const id = params?.id?.trim();
  if (!id) {
    return badRequestResponse("Bad Request");
  }

  try {
    const formData = await request.formData();
    const name = getString(formData, "name");
    const email = getString(formData, "email");
    const imageRaw = getString(formData, "image");
    const image = imageRaw === "" ? null : imageRaw;
    const emailVerified = getBoolean(formData, "emailVerified", false);
    const roleNum = getNumber(formData, "role", null);
    const role = roleNum ?? undefined;

    const privilegeError = assertCanSetUserRole(
      currentUser.role ?? 3,
      currentUser.id,
      id,
      role
    );
    if (privilegeError) {
      return errorResponse(privilegeError, HTTP_STATUS_CODES.FORBIDDEN);
    }

    if (!name || !email) {
      return badRequestResponse("Bad Request");
    }

    if (!(await userExists(db, id))) {
      return notFoundResponse("Not Found");
    }

    if (await emailExists(db, email, id)) {
      return errorResponse("Conflict: email already exists", HTTP_STATUS_CODES.CONFLICT);
    }

    await updateUser(db, id, {
      name,
      email,
      image,
      emailVerified,
      role,
    });

    await invalidateContentListByTable(locals, "user");
    return htmxRefreshResponse();
  } catch (err) {
    console.error("PUT /api/users/[id]", err);
    return internalServerErrorResponse();
  }
};
