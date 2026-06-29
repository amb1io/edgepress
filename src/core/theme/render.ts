import { Liquid } from "liquidjs";
import type { ThemePackageRecord, ThemeRenderContext } from "./types.ts";
import { registerThemeApi } from "./theme-api.ts";
import { normalizeTemplateKey, resolveTemplateKey } from "./resolve-template.ts";

const LAYOUT_DIRECTIVE = /^\{%\s*layout\s+['"]([^'"]+)['"]\s*%\}\s*/;

const liquidBySlug = new Map<string, Liquid>();

function liquidCacheKey(pkg: ThemePackageRecord): string {
  return `${pkg.manifest.slug}:${pkg.updated_at}`;
}

function buildTemplatesMap(pkg: ThemePackageRecord): Record<string, string> {
  const templates: Record<string, string> = {};
  for (const [key, source] of Object.entries(pkg.templates)) {
    templates[key] = source;
    templates[`${key}.liquid`] = source;
  }
  return templates;
}

function getLiquidForPackage(pkg: ThemePackageRecord): Liquid {
  const cacheKey = liquidCacheKey(pkg);
  const cached = liquidBySlug.get(cacheKey);
  if (cached) return cached;

  const liquid = new Liquid({
    outputEscape: "escape",
    strictFilters: false,
    strictVariables: false,
    templates: buildTemplatesMap(pkg),
    extname: ".liquid",
  });
  registerThemeApi(liquid);
  liquidBySlug.set(cacheKey, liquid);
  return liquid;
}

function parseLayoutDirective(source: string): { layoutKey: string | null; body: string } {
  const match = source.match(LAYOUT_DIRECTIVE);
  if (!match) return { layoutKey: null, body: source };
  const layoutKey = normalizeTemplateKey(match[1] ?? "");
  const body = source.slice(match[0].length);
  return { layoutKey, body };
}

export async function renderTheme(
  pkg: ThemePackageRecord,
  ctx: ThemeRenderContext,
): Promise<string> {
  const liquid = getLiquidForPackage(pkg);

  const templateKey = resolveTemplateKey(ctx.route.kind, pkg.templates, {
    postTypeSlug: ctx.post?.post_type_slug,
    postSlug: ctx.post?.slug,
    archiveType: ctx.archive.type,
  });
  if (!templateKey) {
    throw new Error(`No template for route kind: ${ctx.route.kind}`);
  }

  const templateSource = pkg.templates[templateKey];
  if (!templateSource) {
    throw new Error(`Template not found in package: ${templateKey}`);
  }

  const { layoutKey: inlineLayout, body: pageSource } = parseLayoutDirective(templateSource);
  const pageHtml = await liquid.parseAndRender(pageSource, ctx as unknown as object);

  const layoutKey =
    inlineLayout ??
    (pkg.manifest.layout ? normalizeTemplateKey(pkg.manifest.layout) : null);

  if (!layoutKey) {
    return pageHtml;
  }

  const layoutSource = pkg.templates[layoutKey];
  if (!layoutSource) {
    return pageHtml;
  }

  const layoutCtx: ThemeRenderContext = {
    ...ctx,
    content: pageHtml,
    post: ctx.post,
  };

  return liquid.parseAndRender(layoutSource, layoutCtx as unknown as object);
}

export function resetLiquidForTests(): void {
  liquidBySlug.clear();
}
