import type { APIRoute } from "astro";
import { createEdgepressContent } from "../../utils/api";

const JOBS_PER_PAGE = 24;

export const GET: APIRoute = async ({ url, locals }) => {
  const content = createEdgepressContent(locals, { baseUrl: url.origin });
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(
    50,
    Math.max(1, Number(url.searchParams.get("limit")) || JOBS_PER_PAGE),
  );
  const taxonomySlug = url.searchParams.get("slug") ?? undefined;
  const lang = url.searchParams.get("lang") ?? "br";
  const order = url.searchParams.get("order") ?? "meta_order";
  const orderDir =
    (url.searchParams.get("orderDir") as "asc" | "desc" | null) ?? "desc";
  const idLocaleCodeParam = url.searchParams.get("id_locale_code");
  const idLocaleCode =
    idLocaleCodeParam != null
      ? Number(idLocaleCodeParam)
      : lang === "br"
        ? 9
        : 1;

  const query: Record<string, string | number> = {
    filter_post_type: "post",
    page,
    limit,
    order,
    orderDir,
  };
  query.id_locale_code = idLocaleCode;
  if (taxonomySlug) {
    query.filter_taxonomy_slug = taxonomySlug;
  }
  if (idLocaleCodeParam) {
    query.id_locale_code = Number(idLocaleCodeParam);
  }

  const result = await content.getListWithDetails("posts", {
    query,
  });

  const jobs = result.items
    .map((job: any) => ({
      title: job.title,
      slug: job.slug,
      image: content.getMediaUrl(job.meta_values?.post_thumbnail_id),
      order: job.meta_values?.order,
    }))
    .sort((a: any, b: any) => (b.order ?? 0) - (a.order ?? 0));

  return new Response(
    JSON.stringify({
      jobs,
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
      hasMore: result.page < result.totalPages,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    },
  );
};
