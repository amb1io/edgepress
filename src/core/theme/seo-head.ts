import { stripHtml } from "../services/json-ld-service.ts";
import type { ThemeRenderContext, ThemeRouteKind } from "./types.ts";

/** Emits standardized SEO `<head>` tags (title, meta, OG, Twitter, JSON-LD). */
export function renderSeoHead(ctx: ThemeRenderContext): string {
  const { seo } = ctx;
  const title = escapeHtml(seo.title || ctx.site.title || " ");
  const description = escapeHtml(seo.description || "");
  const canonical = escapeHtml(seo.canonical || ctx.site.base_url);
  const ogImage = seo.og_image ? escapeHtml(seo.og_image) : "";
  const ogType = escapeHtml(seo.og_type || "website");
  const siteName = seo.site_name ? escapeHtml(seo.site_name) : "";

  const parts: string[] = [
    `<title>${title}</title>`,
    `<meta charset="UTF-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1.0" />`,
  ];

  if (description) {
    parts.push(`<meta name="description" content="${description}" />`);
  }
  parts.push(`<link rel="canonical" href="${canonical}" />`);
  parts.push(`<meta property="og:type" content="${ogType}" />`);
  parts.push(`<meta property="og:title" content="${title}" />`);
  if (description) {
    parts.push(`<meta property="og:description" content="${description}" />`);
  }
  parts.push(`<meta property="og:url" content="${canonical}" />`);
  if (siteName) {
    parts.push(`<meta property="og:site_name" content="${siteName}" />`);
  }
  if (ogImage) {
    parts.push(`<meta property="og:image" content="${ogImage}" />`);
  }
  parts.push(
    `<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}" />`,
  );
  parts.push(`<meta name="twitter:title" content="${title}" />`);
  if (description) {
    parts.push(`<meta name="twitter:description" content="${description}" />`);
  }
  if (ogImage) {
    parts.push(`<meta name="twitter:image" content="${ogImage}" />`);
  }
  if (seo.json_ld_html) {
    parts.push(seo.json_ld_html);
  }

  return parts.join("\n  ");
}

export function buildSeoFromPost(input: {
  post?: {
    title?: string;
    excerpt?: string | null;
    body?: string | null;
    seo?: { title?: string; description?: string; canonical?: string } | null;
    post_type_slug?: string;
    json_ld?: Record<string, unknown>[] | null;
  };
  fallbackTitle?: string;
  canonicalUrl: string;
  siteName?: string;
  ogImage?: string;
}): ThemeRenderContext["seo"] {
  const post = input.post ?? {};
  const seo = (post.seo ?? null) as {
    title?: string;
    description?: string;
    canonical?: string;
  } | null;

  const rawTitle = String((seo?.title ?? post.title ?? input.fallbackTitle) ?? "").trim();
  const rawDescription = String(
    (seo?.description ?? post.excerpt ?? post.body ?? "") ?? "",
  ).trim();

  const jsonLd = Array.isArray(post.json_ld) ? post.json_ld : [];
  const json_ld_html =
    jsonLd.length > 0
      ? `<script type="application/ld+json">${JSON.stringify(jsonLd.length === 1 ? jsonLd[0] : jsonLd)}</script>`
      : undefined;

  return {
    title: rawTitle || input.fallbackTitle || " ",
    description: stripHtml(rawDescription).slice(0, 300),
    canonical: seo?.canonical?.trim() || input.canonicalUrl,
    og_image: input.ogImage,
    og_type: String(post.post_type_slug ?? "") === "post" ? "article" : "website",
    site_name: input.siteName,
    json_ld_html,
  };
}

type ThemeSeoPostInput = NonNullable<Parameters<typeof buildSeoFromPost>[0]["post"]>;

/** Resolves `seo` for `{% seo_head %}` from route kind and manifest home mode. */
export function resolveThemeSeoContext(input: {
  resolvedKind: ThemeRouteKind;
  isArchiveRoute: boolean;
  archiveTitle: string;
  homeListPosts: boolean;
  seoPost?: ThemeSeoPostInput;
  siteName: string;
  siteDescription: string;
  canonicalUrl: string;
  ogImage?: string;
}): ThemeRenderContext["seo"] {
  const base = {
    canonicalUrl: input.canonicalUrl,
    siteName: input.siteName,
    ...(input.ogImage ? { ogImage: input.ogImage } : {}),
  };

  if (input.isArchiveRoute) {
    const seo = buildSeoFromPost({
      ...base,
      fallbackTitle: input.archiveTitle,
    });
    return {
      ...seo,
      title: input.archiveTitle,
      description: seo.description || input.siteDescription,
    };
  }

  if (input.resolvedKind === "home" && input.homeListPosts) {
    const seo = buildSeoFromPost({
      ...base,
      fallbackTitle: input.siteName,
    });
    return {
      ...seo,
      title: input.siteName,
      description: seo.description || input.siteDescription,
    };
  }

  if (input.resolvedKind === "home" && input.seoPost) {
    return buildSeoFromPost({
      ...base,
      post: input.seoPost,
      fallbackTitle: input.siteName,
    });
  }

  return buildSeoFromPost({
    ...base,
    ...(input.seoPost ? { post: input.seoPost } : {}),
    fallbackTitle: input.siteName,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
