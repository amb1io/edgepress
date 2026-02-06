import type { APIRoute } from "astro";
import { db } from "../../../db/index.ts";
import { taxonomies, postsTaxonomies } from "../../../db/schema.ts";
import { eq, and, ne } from "drizzle-orm";
import { slugify } from "../../../lib/slugify.ts";

export const prerender = false;

export const PUT: APIRoute = async ({ params, request }) => {
  const id = params?.id;
  if (!id || !/^\d+$/.test(id)) {
    return new Response("Bad Request", { status: 400 });
  }
  const termId = parseInt(id, 10);
  try {
    const formData = await request.formData();
    const name = (formData.get("name") as string)?.trim();
    const slugInput = (formData.get("slug") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    const type = (formData.get("type") as string)?.trim();
    const parentIdRaw = formData.get("parent_id");
    if (!name || !type) {
      return new Response("Bad Request", { status: 400 });
    }
    const parent_id =
      parentIdRaw != null && parentIdRaw !== "" && /^\d+$/.test(String(parentIdRaw))
        ? parseInt(String(parentIdRaw), 10)
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
        updated_at: now,
      })
      .where(eq(taxonomies.id, termId));
    return new Response("", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", "HX-Refresh": "true" },
    });
  } catch (err) {
    console.error("PUT /api/taxonomies/[id]", err);
    return new Response("Internal Server Error", { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
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
