import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { taxonomies, postsTaxonomies, locales } from "../../../db/schema.ts";
import { eq, and, ne } from "drizzle-orm";
import { slugify } from "../../../lib/slugify.ts";
import { requireMinRole } from "../../../lib/api-auth.ts";
import { getString, getNumber } from "../../../lib/utils/form-data.ts";
import {
  badRequestResponse,
  errorResponse,
  htmlResponse,
  internalServerErrorResponse,
  jsonResponse,
} from "../../../lib/utils/http-responses.ts";
import { HTTP_STATUS_CODES } from "../../../lib/constants/index.ts";
import { invalidateContentListByTable } from "../../../lib/kv-cache-sync.ts";

export const prerender = false;

async function handleTaxonomyUpdate(
  termId: number,
  request: Request,
  locals: App.Locals,
): Promise<Response> {
  try {
    const formData = await request.formData();
    const name = getString(formData, "name");
    const slugInput = getString(formData, "slug");
    const descriptionRaw = getString(formData, "description");
    const description = descriptionRaw === "" ? null : descriptionRaw;
    const type = getString(formData, "type");
    const parent_id = getNumber(formData, "parent_id", null);
    const id_locale_code = getNumber(formData, "id_locale_code", null);
    if (!name || !type) {
      return badRequestResponse("Bad Request");
    }
    const slug = slugInput ? slugify(slugInput) : slugify(name);
    if (!slug) {
      return badRequestResponse("Bad Request");
    }
    const existing = await db
      .select({ id: taxonomies.id })
      .from(taxonomies)
      .where(and(eq(taxonomies.slug, slug), ne(taxonomies.id, termId)))
      .limit(1);
    if (existing.length > 0) {
      return errorResponse("Conflict", HTTP_STATUS_CODES.CONFLICT);
    }
    const now = Date.now();
    await db
      .update(taxonomies)
      .set({
        name,
        slug,
        description,
        type,
        parent_id,
        id_locale_code,
        updated_at: now,
      })
      .where(eq(taxonomies.id, termId));

    await invalidateContentListByTable(locals, "taxonomies");

    let language = "—";
    if (id_locale_code != null) {
      const [loc] = await db
        .select({ language: locales.language })
        .from(locales)
        .where(eq(locales.id, id_locale_code))
        .limit(1);
      if (loc) language = loc.language;
    }

    return jsonResponse(
      { success: true },
      200,
      {
        "HX-Trigger": JSON.stringify({
          "taxonomy-updated": { id: termId, name, slug, type, language },
        }),
      }
    );
  } catch (err) {
    console.error("PUT/POST /api/taxonomies/[id]", err);
    return internalServerErrorResponse();
  }
}

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 1, locals);
  if (authResult instanceof Response) return authResult;

  const id = params?.id;
  if (!id || !/^\d+$/.test(id)) {
    return badRequestResponse("Bad Request");
  }
  return handleTaxonomyUpdate(parseInt(id, 10), request, locals);
};

/** POST no mesmo path é aceito como fallback quando o form é enviado como POST (ex.: HTMX não intercepta). */
export const POST: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 1, locals);
  if (authResult instanceof Response) return authResult;

  const id = params?.id;
  if (!id || !/^\d+$/.test(id)) {
    return badRequestResponse("Bad Request");
  }
  return handleTaxonomyUpdate(parseInt(id, 10), request, locals);
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 1, locals);
  if (authResult instanceof Response) return authResult;

  const id = params?.id;
  if (!id || !/^\d+$/.test(id)) {
    return badRequestResponse("Bad Request");
  }
  const termId = parseInt(id, 10);
  try {
    await db
      .update(taxonomies)
      .set({ parent_id: null })
      .where(eq(taxonomies.parent_id, termId));
    await db.delete(postsTaxonomies).where(eq(postsTaxonomies.term_id, termId));
    await db.delete(taxonomies).where(eq(taxonomies.id, termId));
    await invalidateContentListByTable(locals, "taxonomies");
    return htmlResponse("", 200);
  } catch (err) {
    console.error("DELETE /api/taxonomies/[id]", err);
    return internalServerErrorResponse();
  }
};
