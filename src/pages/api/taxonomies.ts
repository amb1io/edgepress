import { db } from "../../db/index.ts";
import { taxonomies, locales } from "../../db/schema.ts";
import { eq } from "drizzle-orm";
import { slugify } from "../../lib/slugify.ts";
import { requireMinRole } from "../../lib/api-auth.ts";
import { getString, getNumber } from "../../lib/utils/form-data.ts";
import { errorHtmlResponse, jsonResponse } from "../../lib/utils/http-responses.ts";

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
    const name = getString(formData, "name");
    const slugInput = getString(formData, "slug");
    const descriptionRaw = getString(formData, "description");
    const description = descriptionRaw === "" ? null : descriptionRaw;
    const parent_id = getNumber(formData, "parent_id", null);
    const id_locale_code = getNumber(formData, "id_locale_code", null);
    const type = getString(formData, "type");
    const locale = getString(formData, "locale", "pt-br");

    if (!name || !type) {
      return errorHtmlResponse(locale);
    }

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

    const [inserted] = await db
      .insert(taxonomies)
      .values({
        name,
        slug,
        description,
        type,
        parent_id,
        id_locale_code,
        created_at: now,
        updated_at: now,
      })
      .returning({
        id: taxonomies.id,
        name: taxonomies.name,
        slug: taxonomies.slug,
      });

    if (!inserted) {
      return errorHtmlResponse(locale);
    }

    let language = "—";
    if (id_locale_code != null) {
      const [loc] = await db
        .select({ language: locales.language })
        .from(locales)
        .where(eq(locales.id, id_locale_code))
        .limit(1);
      if (loc) language = loc.language;
    }

    const triggerPayload = {
      "taxonomy-added": {
        id: inserted.id,
        name: inserted.name,
        slug: inserted.slug,
        type,
        language,
        parent_id: parent_id,
      },
    };
    return jsonResponse(
      { success: true, taxonomy: { ...inserted, type, language } },
      200,
      {
        "HX-Trigger": JSON.stringify(triggerPayload),
        "Access-Control-Expose-Headers": "HX-Trigger",
      }
    );
  } catch (err) {
    console.error("POST /api/taxonomies", err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
    return errorHtmlResponse("pt-br");
  }
}
