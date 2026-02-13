import { db } from "../../db/index.ts";
import { taxonomies, locales } from "../../db/schema.ts";
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
    const name = trimFormValue(formData.get("name"));
    const slugInput = trimFormValue(formData.get("slug"));
    const description = trimFormValue(formData.get("description")) || null;
    const parentIdRaw = formData.get("parent_id");
    const idLocaleCodeRaw = formData.get("id_locale_code");
    const type = trimFormValue(formData.get("type"));
    const locale = trimFormValue(formData.get("locale")) || "pt-br";

    if (!name || !type) {
      return errorHtmlResponse(locale);
    }

    const parentIdStr = trimFormValue(parentIdRaw);
    const idLocaleCodeStr = trimFormValue(idLocaleCodeRaw);
    const parent_id =
      parentIdStr !== "" && /^\d+$/.test(parentIdStr) ? parseInt(parentIdStr, 10) : null;
    const id_locale_code =
      idLocaleCodeStr !== "" && /^\d+$/.test(idLocaleCodeStr) ? parseInt(idLocaleCodeStr, 10) : null;

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
    return new Response(
      JSON.stringify({
        success: true,
        taxonomy: { ...inserted, type, language },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "HX-Trigger": JSON.stringify(triggerPayload),
          "Access-Control-Expose-Headers": "HX-Trigger",
        },
      },
    );
  } catch (err) {
    console.error("POST /api/taxonomies", err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) console.error(err.stack);
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

/** Trim and strip optional surrounding double quotes (e.g. "value" → value). */
function trimFormValue(raw: FormDataEntryValue | null): string {
  if (raw == null || typeof raw !== "string") return "";
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).trim();
  return s;
}
