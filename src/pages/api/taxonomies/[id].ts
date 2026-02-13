import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { taxonomies, postsTaxonomies, locales } from "../../../db/schema.ts";
import { eq, and, ne } from "drizzle-orm";
import { slugify } from "../../../lib/slugify.ts";
import { requireMinRole } from "../../../lib/api-auth.ts";

export const prerender = false;

async function handleTaxonomyUpdate(
  termId: number,
  request: Request
): Promise<Response> {
  try {
    const formData = await request.formData();
    const name = (formData.get("name") as string)?.trim();
    const slugInput = (formData.get("slug") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    const type = (formData.get("type") as string)?.trim();
    const parentIdRaw = formData.get("parent_id");
    const idLocaleCodeRaw = formData.get("id_locale_code");
    if (!name || !type) {
      return new Response("Bad Request", { status: 400 });
    }
    const parent_id =
      parentIdRaw != null && parentIdRaw !== "" && /^\d+$/.test(String(parentIdRaw))
        ? parseInt(String(parentIdRaw), 10)
        : null;
    const id_locale_code =
      idLocaleCodeRaw != null && idLocaleCodeRaw !== "" && /^\d+$/.test(String(idLocaleCodeRaw))
        ? parseInt(String(idLocaleCodeRaw), 10)
        : null;
    const slug = slugInput ? slugify(slugInput) : slugify(name);
    if (!slug) {
      return new Response("Bad Request", { status: 400 });
    }
    const existing = await db
      .select({ id: taxonomies.id })
      .from(taxonomies)
      .where(and(eq(taxonomies.slug, slug), ne(taxonomies.id, termId)))
      .limit(1);
    if (existing.length > 0) {
      return new Response("Conflict", { status: 409 });
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

    let language = "—";
    if (id_locale_code != null) {
      const [loc] = await db
        .select({ language: locales.language })
        .from(locales)
        .where(eq(locales.id, id_locale_code))
        .limit(1);
      if (loc) language = loc.language;
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "HX-Trigger": JSON.stringify({
          "taxonomy-updated": { id: termId, name, slug, type, language },
        }),
      },
    });
  } catch (err) {
    console.error("PUT/POST /api/taxonomies/[id]", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 1, locals);
  if (authResult instanceof Response) return authResult;

  const id = params?.id;
  if (!id || !/^\d+$/.test(id)) {
    return new Response("Bad Request", { status: 400 });
  }
  return handleTaxonomyUpdate(parseInt(id, 10), request);
};

/** POST no mesmo path é aceito como fallback quando o form é enviado como POST (ex.: HTMX não intercepta). */
export const POST: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 1, locals);
  if (authResult instanceof Response) return authResult;

  const id = params?.id;
  if (!id || !/^\d+$/.test(id)) {
    return new Response("Bad Request", { status: 400 });
  }
  return handleTaxonomyUpdate(parseInt(id, 10), request);
};

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const authResult = await requireMinRole(request, 1, locals);
  if (authResult instanceof Response) return authResult;

  const id = params?.id;
  if (!id || !/^\d+$/.test(id)) {
    return new Response("Bad Request", { status: 400 });
  }
  const termId = parseInt(id, 10);
  try {
    await db
      .update(taxonomies)
      .set({ parent_id: null })
      .where(eq(taxonomies.parent_id, termId));
    await db.delete(postsTaxonomies).where(eq(postsTaxonomies.term_id, termId));
    await db.delete(taxonomies).where(eq(taxonomies.id, termId));
    return new Response("", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("DELETE /api/taxonomies/[id]", err);
    return new Response("Internal Server Error", { status: 500 });
  }
};
