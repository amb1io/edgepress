import { Liquid, type Tag, type TagToken } from "liquidjs";
import sanitizeHtml from "sanitize-html";
import type { ThemeRenderContext } from "./types.ts";
import { renderSeoHead } from "./seo-head.ts";
import { registerGetTaxonomiesTag, registerGetRelatedPostsTag, registerGetTaxonomyPostsTag, registerGetPostsTag, registerGetPostsDetailsTag, registerGetAuthorTag, registerMenuFilters, registerCustomFieldTag, registerGetTaxonomiesLocaleTag } from "./theme-functions.ts";
import { getBlockNotePublicAssets } from "./blocknote-public-assets.ts";
import { buildMediaUrl, isMediaSize } from "../../utils/media-urls.ts";

type TagImpl = {
  render: (ctx: ThemeRenderContext) => string;
};

function makeHtmlTag(impl: TagImpl): Tag {
  return {
    parse() {},
    render(ctx: { getAll: () => object }) {
      const themeCtx = ctx.getAll() as ThemeRenderContext;
      return impl.render(themeCtx);
    },
  } as unknown as Tag;
}

function makeArgHtmlTag(
  impl: (ctx: ThemeRenderContext, arg: string) => string,
): Tag {
  return {
    parse(token: TagToken) {
      (this as { arg: string }).arg = String(token.args ?? "")
        .trim()
        .replace(/^['"]|['"]$/g, "");
    },
    render(ctx: { getAll: () => object }) {
      const themeCtx = ctx.getAll() as ThemeRenderContext;
      const arg = (this as { arg: string }).arg ?? "";
      return impl(themeCtx, arg);
    },
  } as unknown as Tag;
}

function renderMenuItemLi(item: import("./types.ts").MenuItem): string {
  const hasChildren = item.children && item.children.length > 0;
  const classes: string[] = [];
  if (hasChildren) classes.push("has-submenu");
  if (item.active) classes.push("is-active");
  const liClass = classes.length ? ` class="${classes.join(" ")}"` : "";
  const href = escapeAttr(item.url);
  const label = escapeHtml(item.label);

  let html = `<li${liClass}><a href="${href}">${label}</a>`;
  if (hasChildren) {
    const childLis = item.children.map((child) => renderMenuItemLi(child)).join("\n        ");
    html += `\n      <ul class="submenu">\n        ${childLis}\n      </ul>`;
  }
  html += "</li>";
  return html;
}

function renderNavMenu(ctx: ThemeRenderContext, location: string): string {
  const items = ctx.menus?.[location] ?? [];
  if (items.length === 0) return "";
  const lis = items.map((item) => renderMenuItemLi(item)).join("\n      ");
  return `<nav class="site-nav" aria-label="${escapeAttr(location)}">\n    <ul>\n      ${lis}\n    </ul>\n  </nav>`;
}

function renderPagination(ctx: ThemeRenderContext): string {
  const p = ctx.pagination;
  if (!p || p.total_pages <= 1) return "";
  const parts: string[] = ['<nav class="pagination" aria-label="Pagination">'];
  if (p.prev_url) {
    parts.push(`<a class="pagination-prev" href="${escapeAttr(p.prev_url)}">Anterior</a>`);
  }
  parts.push(`<span class="pagination-status">${p.page} / ${p.total_pages}</span>`);
  if (p.next_url) {
    parts.push(`<a class="pagination-next" href="${escapeAttr(p.next_url)}">Próxima</a>`);
  }
  parts.push("</nav>");
  return parts.join("\n  ");
}

function renderThemeStyles(ctx: ThemeRenderContext): string {
  const href = `${ctx.theme.asset_base_url}/theme.css`;
  return `<link rel="stylesheet" href="${escapeAttr(href)}" />`;
}

function themeSupportsBlockNote(ctx: ThemeRenderContext): boolean {
  return (ctx.theme.supports ?? []).some((flag) => flag.toLowerCase() === "blocknote");
}

function hasHydratableBodyBlocks(post: ThemeRenderContext["post"]): boolean {
  const raw = String(post?.body_blocks ?? "").trim();
  return raw !== "" && raw !== "[]";
}

export function shouldLoadBlockNoteAssets(ctx: ThemeRenderContext): boolean {
  return (
    themeSupportsBlockNote(ctx) && Boolean(ctx._usedFeatures?.has("blocknote"))
  );
}

function escapeJsonForInlineScript(json: string): string {
  return json.replace(/<\//g, "<\\/");
}

function renderTheContentInner(ctx: ThemeRenderContext): string {
  const html = ctx.post?.body_html ?? "";
  if (!html) return "";
  return sanitizeContentHtml(html);
}

function renderBlockNoteContent(ctx: ThemeRenderContext): string {
  const inner = renderTheContentInner(ctx);
  if (!inner && !hasHydratableBodyBlocks(ctx.post)) return "";

  const parts: string[] = [
    '<div class="entry-content block-editor-content edgepress-blocknote">',
  ];

  if (inner) {
    parts.push(`<div class="edgepress-blocknote-fallback">${inner}</div>`);
  }

  if (hasHydratableBodyBlocks(ctx.post)) {
    ctx._usedFeatures?.add("blocknote");
    const blocksJson = escapeJsonForInlineScript(String(ctx.post!.body_blocks ?? "").trim());
    const locale = escapeAttr(ctx.route.locale || ctx.site.locale || "pt-br");
    parts.push(
      `<div class="edgepress-blocknote-root" data-locale="${locale}" hidden aria-hidden="true">`,
      `<script type="application/json" class="edgepress-blocknote-data">${blocksJson}</script>`,
      "</div>",
    );
  }

  parts.push("</div>");
  return parts.join("\n");
}

function renderFooterScripts(ctx: ThemeRenderContext): string {
  const themeJs = `${ctx.theme.asset_base_url}/theme.js`;
  const parts: string[] = [
    `<script src="https://unpkg.com/htmx.org@2.0.8" defer></script>`,
    `<script src="https://unpkg.com/alpinejs@3.15.8/dist/cdn.min.js" defer></script>`,
    `<script src="${escapeAttr(themeJs)}" defer></script>`,
  ];

  if (shouldLoadBlockNoteAssets(ctx)) {
    const assets = getBlockNotePublicAssets();
    if (assets) {
      const base = ctx.site.base_url.replace(/\/+$/, "");
      if (assets.css) {
        parts.push(`<link rel="stylesheet" href="${escapeAttr(`${base}${assets.css}`)}" />`);
      }
      parts.push(
        `<script type="module" src="${escapeAttr(`${base}${assets.js}`)}" defer></script>`,
      );
    }
  }

  return parts.join("\n  ");
}

function sanitizeContentHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "figure",
      "figcaption",
      "video",
      "source",
      "iframe",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "title", "width", "height", "loading"],
      a: ["href", "name", "target", "rel"],
      iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder"],
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

export function registerThemeApi(liquid: Liquid): void {
  liquid.registerTag("seo_head", makeHtmlTag({ render: renderSeoHead }));
  liquid.registerTag(
    "the_content",
    makeHtmlTag({
      render: (ctx) => {
        const inner = renderTheContentInner(ctx);
        if (!inner) return "";
        return `<div class="entry-content block-editor-content">${inner}</div>`;
      },
    }),
  );
  liquid.registerTag(
    "blocknote_content",
    makeHtmlTag({
      render: (ctx) => renderBlockNoteContent(ctx),
    }),
  );
  liquid.registerTag("nav_menu", makeArgHtmlTag(renderNavMenu));
  liquid.registerTag("pagination", makeHtmlTag({ render: renderPagination }));
  liquid.registerTag("theme_styles", makeHtmlTag({ render: renderThemeStyles }));
  liquid.registerTag("scripts_footer", makeHtmlTag({ render: renderFooterScripts }));
  liquid.registerTag(
    "html_attrs",
    makeHtmlTag({
      render: (ctx) => `lang="${escapeAttr(ctx.site.html_lang)}"`,
    }),
  );
  liquid.registerTag(
    "body_class",
    makeHtmlTag({
      render: (ctx) => {
        const cls = ctx.body_class.trim();
        return cls ? `class="${escapeAttr(cls)}"` : "";
      },
    }),
  );
  liquid.registerTag(
    "page_content",
    makeHtmlTag({
      render: (ctx) => String(ctx.content ?? ""),
    }),
  );

  liquid.registerFilter("asset", function (this: { context: { getAll: () => object } }, file: string) {
    const all = this.context.getAll() as ThemeRenderContext;
    const name = String(file ?? "").trim().replace(/^\/+/, "");
    return `${all.theme.asset_base_url}/${name}`;
  });

  liquid.registerFilter("post_date", (ts: number | string | null | undefined) => {
    if (ts == null || ts === "") return "";
    const n = typeof ts === "number" ? ts : Date.parse(String(ts));
    if (!Number.isFinite(n)) return "";
    return new Date(n).toLocaleDateString("pt-BR");
  });

  liquid.registerFilter("image_size", (value: unknown, size: unknown) => {
    const url = String(value ?? "").trim();
    if (!url) return "";
    if (!isMediaSize(size)) return url;
    return buildMediaUrl(url, size) ?? url;
  });

  liquid.registerFilter("escape", (value: unknown) => escapeHtml(String(value ?? "")));

  liquid.registerFilter("html", {
    raw: true,
    handler: (value: unknown) => sanitizeContentHtml(String(value ?? "")),
  });

  liquid.registerFilter(
    "sort_by_meta_order",
    (items: Array<{ id?: number; meta?: Record<string, string> }> | null | undefined) => {
      if (!Array.isArray(items)) return [];
      return [...items].sort((a, b) => {
        const orderA = Number(a.meta?.order ?? 0);
        const orderB = Number(b.meta?.order ?? 0);
        if (orderB !== orderA) return orderB - orderA;
        return Number(b.id ?? 0) - Number(a.id ?? 0);
      });
    },
  );

  registerGetTaxonomiesTag(liquid);
  registerGetTaxonomiesLocaleTag(liquid);
  registerGetRelatedPostsTag(liquid);
  registerGetTaxonomyPostsTag(liquid);
  registerGetPostsTag(liquid);
  registerGetPostsDetailsTag(liquid);
  registerGetAuthorTag(liquid);
  registerMenuFilters(liquid);
  registerCustomFieldTag(liquid);
}
