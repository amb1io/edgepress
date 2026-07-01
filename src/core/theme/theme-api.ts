import { Liquid, type Tag, type TagToken } from "liquidjs";
import sanitizeHtml from "sanitize-html";
import type { ThemeRenderContext } from "./types.ts";
import { renderSeoHead } from "./seo-head.ts";
import { registerGetTaxonomiesTag, registerGetRelatedPostsTag, registerGetAuthorTag } from "./theme-functions.ts";

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

function renderNavMenu(ctx: ThemeRenderContext, location: string): string {
  const items = ctx.menus?.[location] ?? [];
  if (items.length === 0) return "";
  const lis = items
    .map((item) => {
      const active = item.active ? ' class="is-active"' : "";
      const href = escapeAttr(item.url);
      const label = escapeHtml(item.label);
      return `<li${active}><a href="${href}">${label}</a></li>`;
    })
    .join("\n      ");
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

function renderFooterScripts(ctx: ThemeRenderContext): string {
  const themeJs = `${ctx.theme.asset_base_url}/theme.js`;
  return [
    `<script src="https://unpkg.com/htmx.org@2.0.8" defer></script>`,
    `<script src="https://unpkg.com/alpinejs@3.15.8/dist/cdn.min.js" defer></script>`,
    `<script src="${escapeAttr(themeJs)}" defer></script>`,
  ].join("\n  ");
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
        const html = ctx.post?.body_html ?? "";
        if (!html) return "";
        return `<div class="entry-content block-editor-content">${sanitizeContentHtml(html)}</div>`;
      },
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

  liquid.registerFilter("escape", (value: unknown) => escapeHtml(String(value ?? "")));

  registerGetTaxonomiesTag(liquid);
  registerGetRelatedPostsTag(liquid);
  registerGetAuthorTag(liquid);
}
