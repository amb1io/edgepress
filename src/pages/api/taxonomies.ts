import { db } from "../../db/index.ts";
import { taxonomies } from "../../db/schema.ts";
import { eq } from "drizzle-orm";
import { slugify } from "../../lib/slugify.ts";
import { t } from "../../i18n/index.ts";
import { requireMinRole } from "../../lib/api-auth.ts";

export const prerender = false;

export async function POST({
  request,
  locals,
}: {
  request: Request;
  locals: App.Locals;
}): Promise<Response> {
  const authResult = await requireMinRole(request, 1, locals);
  if (authResult instanceof Response) return authResult;

  try {
    const formData = await request.formData();
    const name = (formData.get("name") as string)?.trim();
    const slugInput = (formData.get("slug") as string)?.trim();
    const description = (formData.get("description") as string)?.trim() || null;
    const parentIdRaw = formData.get("parent_id");
    const type = (formData.get("type") as string)?.trim();
    const locale = (formData.get("locale") as string)?.trim() || "pt-br";

    if (!name || !type) {
      return errorHtmlResponse(locale);
    }

    const parent_id =
      parentIdRaw != null && parentIdRaw !== "" && /^\d+$/.test(String(parentIdRaw))
        ? parseInt(String(parentIdRaw), 10)
        : null;

    const slug = slugInput ? slugify(slugInput) : slugify(name);
    if (!slug) {
      return errorHtmlResponse(locale);
    }

    const now = Date.now();

    const existing = await db
      .select({ id: taxonomies.id })
      .from(taxonomies)
      .where(eq(taxonomies.slug, slug))
      .limit(1);

    if (existing.length > 0) {
      return errorHtmlResponse(locale);
    }

    const [inserted] = await db.insert(taxonomies).values({
      name,
      slug,
      description,
      type,
      parent_id,
      created_at: now,
      updated_at: now,
    }).returning({
      id: taxonomies.id,
      name: taxonomies.name,
      slug: taxonomies.slug,
    });

    return new Response(JSON.stringify({ 
      success: true, 
      taxonomy: inserted 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "HX-Trigger": JSON.stringify({ 
          "taxonomy-added": { 
            id: inserted.id, 
            name: inserted.name, 
            slug: inserted.slug,
            parent_id: parent_id 
          } 
        }),
      },
    });
  } catch (err) {
    console.error("POST /api/taxonomies", err);
    return errorHtmlResponse("pt-br");
  }
}

function errorHtmlResponse(locale: string) {
  const msg = t(locale, "admin.taxonomy.errorMessage");
  const html = `<p class="text-error text-sm mt-2" id="taxonomy-modal-error">${escapeHtml(msg)}</p>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
